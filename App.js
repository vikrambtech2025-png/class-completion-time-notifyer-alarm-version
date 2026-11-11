import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  Dimensions,
  SafeAreaView,
  Image,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { recognizeText } from "expo-ocr-kit";
import AsyncStorage from "@react-native-async-storage/async-storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseTime(t) {
  const [h, m] = t.split(":").map(Number);
  return { h, m };
}

function nextOccurrence(h, m) {
  const now = new Date();
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

function validateTime(str) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
}

function formatTime12h(t) {
  if (!t || !validateTime(t)) return t;
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTimeRange(timeStr) {
  if (!timeStr || !timeStr.includes("-")) return timeStr;
  const [start, end] = timeStr.split("-");
  if (!validateTime(start) || !validateTime(end)) return timeStr;
  return `${formatTime12h(start)} - ${formatTime12h(end)}`;
}

const DEFAULT_PERIODS = [
  { period: 1, time: "09:00-09:45", name: "Period 1" },
  { period: 2, time: "09:45-10:35", name: "Period 2" },
  { period: 3, time: "10:50-11:40", name: "Period 3" },
  { period: 4, time: "11:40-12:30", name: "Period 4" },
  { period: 5, time: "13:20-14:15", name: "Period 5" },
  { period: 6, time: "14:15-15:10", name: "Period 6" },
  { period: 7, time: "15:20-16:15", name: "Period 7" },
];

function createBlankSchedule() {
  const periods = DEFAULT_PERIODS.map((p) => ({ ...p }));
  const timetable = {};
  DAYS.forEach((day) => {
    timetable[day] = periods.map((p) => ({
      period: p.period,
      subject: "",
      faculty: "",
    }));
  });
  return { periods, timetable };
}

function parseTimetableJSON(json) {
  let data;
  try {
    data = typeof json === "string" ? JSON.parse(json) : json;
  } catch (_e) {
    throw new Error("Invalid JSON file");
  }

  let periods = [];
  if (Array.isArray(data.periods)) {
    periods = data.periods.map((p, i) => ({
      period: p.period || i + 1,
      time: p.time || "09:00-09:45",
      name: p.name || `Period ${p.period || i + 1}`,
    }));
  } else if (Array.isArray(data.defaultPeriods)) {
    periods = data.defaultPeriods.map((p, i) => ({
      period: p.period || i + 1,
      time: p.time || "09:00-09:45",
      name: p.name || `Period ${p.period || i + 1}`,
    }));
  } else {
    periods = DEFAULT_PERIODS.map((p) => ({ ...p }));
  }

  if (periods.length === 0) {
    periods = DEFAULT_PERIODS.map((p) => ({ ...p }));
  }

  const timetable = {};
  const sourceTimetable = data.timetable || {};

  DAYS.forEach((day) => {
    const dayEntries = sourceTimetable[day] || sourceTimetable[day.toLowerCase()] || [];
    const entries = [];

    if (Array.isArray(dayEntries)) {
      dayEntries.forEach((entry) => {
        if (entry.periods && Array.isArray(entry.periods)) {
          entry.periods.forEach((pNum) => {
            entries.push({
              period: pNum,
              subject: entry.subject || "",
              faculty: Array.isArray(entry.faculty) ? entry.faculty.join(", ") : (entry.faculty || ""),
            });
          });
        } else if (entry.period) {
          entries.push({
            period: entry.period,
            subject: entry.subject || "",
            faculty: Array.isArray(entry.faculty) ? entry.faculty.join(", ") : (entry.faculty || ""),
          });
        }
      });
    }

    const periodNums = periods.map((p) => p.period);
    periodNums.forEach((pNum) => {
      if (!entries.find((e) => e.period === pNum)) {
        entries.push({ period: pNum, subject: "", faculty: "" });
      }
    });

    entries.sort((a, b) => a.period - b.period);
    timetable[day] = entries;
  });

  return { periods, timetable };
}

function extractTimesFromText(text) {
  if (!text) return [];
  const times = [];
  // Match HH:MM or H:MM or HH.MM or H.MM (colon or dot separator)
  const timePattern = /(\d{1,2})[:.](\d{2})/g;
  let match;
  while ((match = timePattern.exec(text)) !== null) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  // Also try to match 4-digit times like "0900" or "09 00"
  const timePattern2 = /(\d{2})\s+(\d{2})/g;
  let match2;
  while ((match2 = timePattern2.exec(text)) !== null) {
    const h = parseInt(match2[1], 10);
    const m = parseInt(match2[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      if (!times.includes(t)) times.push(t);
    }
  }
  return times;
}

function parseOCRText(text) {
  const times = extractTimesFromText(text);
  const periods = [];

  if (times.length >= 2) {
    for (let i = 0; i + 1 < times.length; i += 2) {
      periods.push({
        period: periods.length + 1,
        time: `${times[i]}-${times[i + 1]}`,
        name: `Period ${periods.length + 1}`,
      });
    }
  }

  if (periods.length === 0) {
    periods = DEFAULT_PERIODS.map((p) => ({ ...p }));
  }

  const timetable = {};
  DAYS.forEach((day) => {
    timetable[day] = periods.map((p) => ({
      period: p.period,
      subject: "",
      faculty: "",
    }));
  });

  return { periods, timetable };
}

const STORAGE_KEY = "@period_timer_schedule";

export default function App() {
  const [status, setStatus] = useState("Initializing...");
  const [scheduled, setScheduled] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editPeriods, setEditPeriods] = useState([]);
  const [editTimetable, setEditTimetable] = useState({});
  const [saving, setSaving] = useState(false);
  // (inline editing removed - main page cleared)
  const [uploading, setUploading] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);

  const screenData = Dimensions.get("window");
  const isSmallScreen = screenData.width < 360;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSchedule(parsed);
        } else {
          setSchedule(createBlankSchedule());
        }
      } catch (_e) {
        console.warn("Failed to load saved data", _e);
        setSchedule(createBlankSchedule());
      }

      if (!Device.isDevice) {
        setStatus("Must run on a physical device");
        return;
      }
      const { status: existing } = await Notifications.getPermissionsAsync();
      let final = existing;
      if (existing !== "granted") {
        Alert.alert(
          "Notification Permission Required",
          "This app needs notification permission to schedule period alarms.",
          [{ text: "OK" }]
        );
        const { status } = await Notifications.requestPermissionsAsync();
        final = status;
      }
      if (final !== "granted") {
        setStatus("Notification permission DENIED - alarms will not work!");
        Alert.alert(
          "Permission Denied",
          "Without notification permission, alarms cannot be scheduled.",
          [{ text: "OK" }]
        );
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("period-alarms-v3", {
          name: "Period Alarms",
          importance: 5,
          sound: "buzzer",
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: 1,
          bypassDnd: true,
        });
      }

      setStatus("Ready — upload timetable (JSON or image)");
    })();
  }, []);

  const currentSchedule = schedule || createBlankSchedule();

  const persistSchedule = useCallback(async (data) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_e) {
      console.warn("Failed to save data", _e);
    }
  }, []);

  const updateSchedule = useCallback(
    (updated) => {
      setSchedule(updated);
      persistSchedule(updated);
    },
    [persistSchedule]
  );

  async function scheduleAll(periodList) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const items = [];
    for (const pt of periodList) {
      const [start] = (pt.time || "").split("-");
      if (!validateTime(start)) continue;
      const s = parseTime(start);
      const when = nextOccurrence(s.h, s.m);
      const name = pt.name || `Period ${pt.period}`;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Period ${pt.period}: ${name}`,
          body: `${name} — ${formatTimeRange(pt.time)}`,
          priority: 2,
          sticky: true,
          autoDismiss: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: "period-alarms-v3",
        },
      });
      items.push({ period: pt.period, time: pt.time, name, id });
    }
    setScheduled(items);
    setStatus(`Scheduled ${items.length} period alarms`);
  }

  async function handleUploadJSON() {
    try {
      setUploading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setUploading(false);
        return;
      }

      const file = result.assets ? result.assets[0] : result;
      if (!file || !file.uri) {
        Alert.alert("Error", "Could not read the selected file.");
        setUploading(false);
        return;
      }

      const response = await fetch(file.uri);
      const text = await response.text();
      const parsed = parseTimetableJSON(text);

      updateSchedule(parsed);
      setStatus(`Timetable uploaded! ${parsed.periods.length} periods loaded.`);
      Alert.alert("Success", `Timetable loaded with ${parsed.periods.length} periods across ${DAYS.length} days.`);
    } catch (_e) {
      console.warn("Upload error:", _e);
      Alert.alert("Upload Failed", _e.message || "Could not parse the timetable file. Please ensure it's a valid JSON timetable.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadImage() {
    try {
      setUploading(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Denied", "Media library permission is required to pick images.");
        setUploading(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });

      if (result.canceled) {
        setUploading(false);
        return;
      }

      const asset = result.assets ? result.assets[0] : result;
      if (!asset || !asset.uri) {
        Alert.alert("Error", "Could not read the selected image.");
        setUploading(false);
        return;
      }

      setUploadedImage(asset.uri);

      try {
        const ocrResult = await recognizeText(asset.uri);
        console.log("OCR Result:", JSON.stringify(ocrResult));
        const text = ocrResult?.text || (Array.isArray(ocrResult?.blocks) ? ocrResult.blocks.map((b) => b.text || "").join("\n") : "") || "";
        setOcrText(text || "No text detected by OCR.");

        if (!text || text.trim().length === 0) {
          updateSchedule(createBlankSchedule());
          setStatus("Image loaded. No text detected — please enter data manually.");
          Alert.alert(
            "No Text Detected",
            "OCR could not detect any text in the image. The image is shown as reference. Please enter the schedule manually using 'Edit Periods'."
          );
          setShowOCRModal(true);
          return;
        }

        const parsed = parseOCRText(text);
        updateSchedule(parsed);
        const timesFound = extractTimesFromText(text);
        setStatus(`Image processed! ${parsed.periods.length} periods, ${timesFound.length} times found. Edit as needed.`);
        Alert.alert(
          "Image Processed",
          `Extracted ${timesFound.length} time values and ${parsed.periods.length} periods from the image. Please review and edit the schedule. The OCR text is shown for reference.`
        );
        setShowOCRModal(true);
      } catch (ocrErr) {
        console.warn("OCR error:", ocrErr);
        updateSchedule(createBlankSchedule());
        setStatus("Image loaded. OCR failed — please enter data manually.");
        Alert.alert(
          "OCR Failed",
          `OCR error: ${ocrErr?.message || "Unknown error"}. The image is shown as reference. Please enter the schedule manually using 'Edit Periods'.`
        );
        setShowOCRModal(true);
      }
    } catch (_e) {
      console.warn("Image upload error:", _e);
      Alert.alert("Upload Failed", _e.message || "Could not process the image.");
    } finally {
      setUploading(false);
    }
  }

  function handleUpload() {
    Alert.alert(
      "Upload Timetable",
      "Choose the type of file to upload:",
      [
        { text: "JSON File", onPress: handleUploadJSON },
        { text: "Image (Photo)", onPress: handleUploadImage },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  function openEditor() {
    setEditPeriods(currentSchedule.periods.map((p) => ({ ...p })));
    setEditTimetable(JSON.parse(JSON.stringify(currentSchedule.timetable)));
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
  }

  function updateEditPeriod(index, field, value) {
    setEditPeriods((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addPeriod() {
    const lastPeriod = editPeriods[editPeriods.length - 1];
    const newPeriod = {
      period: editPeriods.length + 1,
      time: lastPeriod ? lastPeriod.time : "09:00-09:45",
      name: `Period ${editPeriods.length + 1}`,
    };
    setEditPeriods((prev) => [...prev, newPeriod]);
    setEditTimetable((prev) => {
      const next = { ...prev };
      DAYS.forEach((day) => {
        if (!next[day]) next[day] = [];
        next[day] = [...next[day], { period: newPeriod.period, subject: "", faculty: "" }];
      });
      return next;
    });
  }

  function removePeriod(index) {
    const periodNum = editPeriods[index].period;
    setEditPeriods((prev) => prev.filter((_, i) => i !== index));
    setEditTimetable((prev) => {
      const next = { ...prev };
      DAYS.forEach((day) => {
        if (next[day]) {
          next[day] = next[day].filter((e) => e.period !== periodNum);
        }
      });
      return next;
    });
  }

  async function saveAndReschedule() {
    for (const p of editPeriods) {
      const [start, end] = (p.time || "").split("-");
      if (!validateTime(start) || !validateTime(end)) {
        Alert.alert("Invalid Time", `Period ${p.period} has invalid time format. Use HH:MM-HH:MM (e.g., 09:00-09:45)`);
        return;
      }
    }
    setSaving(true);
    const updated = {
      periods: editPeriods.map((p, i) => ({ ...p, period: i + 1 })),
      timetable: editTimetable,
    };
    DAYS.forEach((day) => {
      if (!updated.timetable[day]) {
        updated.timetable[day] = [];
      }
      while (updated.timetable[day].length < updated.periods.length) {
        updated.timetable[day].push({
          period: updated.timetable[day].length + 1,
          subject: "",
          faculty: "",
        });
      }
      updated.timetable[day] = updated.timetable[day].slice(0, updated.periods.length);
      updated.timetable[day] = updated.timetable[day].map((e, i) => ({
        ...e,
        period: i + 1,
      }));
    });
    updateSchedule(updated);
    await scheduleAll(updated.periods);
    setSaving(false);
    setShowEditor(false);
  }

  // (inline editing removed - main page cleared)

  const titleSize = isSmallScreen ? 18 : 22;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { fontSize: titleSize }]}>Period Timer — Timetable</Text>
        <Text style={styles.status}>{status}</Text>

        {/* Uploaded Image Reference */}
        {uploadedImage && (
          <View style={styles.imageContainer}>
            <Text style={styles.imageLabel}>Uploaded Timetable Image:</Text>
            <Image source={{ uri: uploadedImage }} style={styles.uploadedImage} resizeMode="contain" />
          </View>
        )}

        <Text style={styles.footer}>Scheduled: {scheduled.length} alarms</Text>
      </ScrollView>

      {/* OCR Text Reference Modal */}
      <Modal visible={showOCRModal} animationType="slide" transparent={false} onRequestClose={() => setShowOCRModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>OCR Extracted Text</Text>
            <TouchableOpacity onPress={() => setShowOCRModal(false)} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <Text style={styles.ocrLabel}>Raw OCR Text:</Text>
            <Text style={styles.ocrText}>{ocrText || "No text extracted."}</Text>
            <Text style={styles.ocrHint}>
              Review the extracted text above. Times found: {extractTimesFromText(ocrText).length}. Edit the schedule using {'"'}Edit Periods{'"'} or by tapping subject/faculty fields on the main page.
            </Text>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowOCRModal(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Period Editor Modal */}
      <Modal visible={showEditor} animationType="slide" transparent={false} onRequestClose={closeEditor}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Periods</Text>
            <TouchableOpacity onPress={closeEditor} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {editPeriods.map((p, index) => (
              <View key={index} style={styles.periodCard}>
                <View style={styles.periodCardHeader}>
                  <View style={styles.periodBadge}>
                    <Text style={styles.periodBadgeText}>P{index + 1}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removePeriod(index)} style={styles.deleteBtn} activeOpacity={0.7}>
                    <Text style={styles.deleteBtnText}>🗑</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Period Name</Text>
                <TextInput
                  style={styles.input}
                  value={p.name || ""}
                  onChangeText={(v) => updateEditPeriod(index, "name", v)}
                  placeholder="e.g., Period 1"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Time (HH:MM-HH:MM)</Text>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={(p.time || "").split("-")[0] || ""}
                    onChangeText={(v) => {
                      const end = (p.time || "").split("-")[1] || "";
                      updateEditPeriod(index, "time", `${v}-${end}`);
                    }}
                    placeholder="09:00"
                    placeholderTextColor="#999"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <Text style={styles.timeSeparator}>to</Text>
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={(p.time || "").split("-")[1] || ""}
                    onChangeText={(v) => {
                      const start = (p.time || "").split("-")[0] || "";
                      updateEditPeriod(index, "time", `${start}-${v}`);
                    }}
                    placeholder="09:45"
                    placeholderTextColor="#999"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                <Text style={styles.timePreview}>{formatTimeRange(p.time)}</Text>
              </View>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={addPeriod} activeOpacity={0.7}>
              <Text style={styles.addBtnText}>+ Add Period</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.modalFooter}>
            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={saveAndReschedule}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save & Schedule"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeEditor} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.uploadBtn, uploading && styles.saveBtnDisabled]}
          onPress={handleUpload}
          activeOpacity={0.7}
          disabled={uploading}
        >
          <Text style={styles.bottomBtnText}>{uploading ? "Uploading..." : "Upload Timetable"}</Text>
          <Text style={styles.btnHint}>Load JSON or photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.rescheduleBtn]}
          onPress={openEditor}
          activeOpacity={0.7}
        >
          <Text style={styles.bottomBtnText}>Edit Periods</Text>
          <Text style={styles.btnHint}>Change times & names</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => {
            scheduleAll(currentSchedule.periods);
          }}
          disabled={saving}
          activeOpacity={0.7}
        >
          <Text style={styles.bottomBtnText}>Schedule Alarms</Text>
          <Text style={styles.btnHint}>Set buzzer alarms</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { padding: 12, paddingBottom: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  status: { fontSize: 13, color: "#555", marginBottom: 10 },
  imageContainer: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
  },
  imageLabel: { fontSize: 12, color: "#666", marginBottom: 4, fontWeight: "600" },
  uploadedImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  day: { marginBottom: 10, padding: 8, backgroundColor: "#f2f2f2", borderRadius: 8 },
  dayTitle: { fontSize: 15, fontWeight: "bold", marginBottom: 6, color: "#2196F3" },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  periodInfo: { width: 70, alignItems: "center" },
  periodNum: { fontSize: 14, fontWeight: "bold", color: "#333" },
  periodName: { fontSize: 10, color: "#2196F3", fontWeight: "600", textAlign: "center" },
  periodTime: { fontSize: 11, color: "#666" },
  periodFields: { flex: 1, marginLeft: 8 },
  inlineText: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#ddd",
    minHeight: 36,
    justifyContent: "center",
  },
  inlineTextLabel: { fontSize: 13, color: "#333" },
  placeholderText: { color: "#999", fontStyle: "italic" },
  inlineInput: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#2196F3",
    fontSize: 13,
    color: "#333",
    minHeight: 36,
  },
  footer: { marginTop: 12, fontSize: 12, color: "#888", textAlign: "center" },
  ocrText: { fontSize: 12, color: "#333", lineHeight: 18 },
  ocrLabel: { fontSize: 13, fontWeight: "bold", color: "#2196F3", marginBottom: 4 },
  ocrHint: { fontSize: 12, color: "#888", marginTop: 12, fontStyle: "italic" },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    gap: 6,
  },
  bottomBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  bottomBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", textAlign: "center" },
  btnHint: { fontSize: 9, color: "#fff", marginTop: 2, textAlign: "center", fontWeight: "bold", opacity: 0.9 },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: "#f5f5f5" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#2196F3",
    paddingTop: Platform.OS === "ios" ? 50 : 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  closeBtn: {
    padding: 8,
    minWidth: 36,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: { fontSize: 20, color: "#fff", fontWeight: "bold" },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 30 },
  periodCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  periodCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  periodBadge: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  periodBadgeText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  deleteBtn: {
    padding: 8,
    minWidth: 36,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtnText: { fontSize: 18 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    backgroundColor: "#fafafa",
    color: "#333",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeInput: { flex: 1, textAlign: "center" },
  timeSeparator: { marginHorizontal: 10, fontSize: 14, color: "#666", fontWeight: "600" },
  timePreview: { fontSize: 13, color: "#2196F3", fontWeight: "600", textAlign: "center", marginTop: 6 },
  addBtn: {
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
    minHeight: 48,
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalFooter: {
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modalFooterRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    backgroundColor: "#999",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  cancelBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});