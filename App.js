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
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import timetableData from "./timetable.json";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DAYS = timetableData.days;
const DEFAULT_PERIODS = timetableData.defaultPeriods.map((p) => ({ ...p }));

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

function createBlankSemester() {
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

const STORAGE_KEY = "@period_timer_semesters";

export default function App() {
  const [status, setStatus] = useState("Initializing...");
  const [scheduled, setScheduled] = useState([]);
  const [selectedYear, setSelectedYear] = useState(1);
  const [selectedSemester, setSelectedSemester] = useState(1);
  const [semesters, setSemesters] = useState({});
  const [showEditor, setShowEditor] = useState(false);
  const [editPeriods, setEditPeriods] = useState([]);
  const [editTimetable, setEditTimetable] = useState({});
  const [saving, setSaving] = useState(false);
  const [inlineEdit, setInlineEdit] = useState(null); // {day, periodIdx, field}
  const [inlineValue, setInlineValue] = useState("");

  const screenData = Dimensions.get("window");
  const isSmallScreen = screenData.width < 360;

  const semesterKey = `Y${selectedYear}S${selectedSemester}`;

  // Load saved data
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSemesters(parsed);
        }
      } catch (e) {
        console.warn("Failed to load saved data", e);
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
          "This app needs notification permission to schedule period alarms. Please tap 'Allow' on the next screen.",
          [{ text: "OK" }]
        );
        const { status } = await Notifications.requestPermissionsAsync();
        final = status;
      }
      if (final !== "granted") {
        setStatus("Notification permission DENIED - alarms will not work!");
        Alert.alert(
          "Permission Denied",
          "Without notification permission, alarms cannot be scheduled. Please enable notifications in your phone settings.",
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

      setStatus("Ready — select year & semester, then schedule");
    })();
  }, []);

  // Get current semester data (or create blank)
  const currentSemester = semesters[semesterKey] || createBlankSemester();

  // Save all semesters to AsyncStorage
  const persistSemesters = useCallback(async (data) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save data", e);
    }
  }, []);

  // Update current semester data
  const updateCurrentSemester = useCallback(
    (updated) => {
      const next = { ...semesters, [semesterKey]: updated };
      setSemesters(next);
      persistSemesters(next);
    },
    [semesters, semesterKey, persistSemesters]
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
    setStatus(`Scheduled ${items.length} period alarms for ${semesterKey}`);
  }

  function openEditor() {
    setEditPeriods(currentSemester.periods.map((p) => ({ ...p })));
    setEditTimetable(JSON.parse(JSON.stringify(currentSemester.timetable)));
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
    // Add to timetable for all days
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
    // Re-index timetable periods
    DAYS.forEach((day) => {
      if (updated.timetable[day]) {
        updated.timetable[day] = updated.timetable[day].map((e, i) => ({
          ...e,
          period: i + 1 <= updated.periods.length ? i + 1 : e.period,
        }));
      }
    });
    updateCurrentSemester(updated);
    await scheduleAll(updated.periods);
    setSaving(false);
    setShowEditor(false);
  }

  // Inline editing handlers
  function startInlineEdit(day, periodIdx, field, currentValue) {
    setInlineEdit({ day, periodIdx, field });
    setInlineValue(currentValue || "");
  }

  function commitInlineEdit() {
    if (!inlineEdit) return;
    const { day, periodIdx, field } = inlineEdit;
    const updated = JSON.parse(JSON.stringify(currentSemester));
    if (updated.timetable[day] && updated.timetable[day][periodIdx]) {
      updated.timetable[day][periodIdx][field] = inlineValue;
    }
    updateCurrentSemester(updated);
    setInlineEdit(null);
    setInlineValue("");
  }

  // Responsive sizing
  const fontSize = isSmallScreen ? 12 : 14;
  const titleSize = isSmallScreen ? 18 : 22;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { fontSize: titleSize }]}>Period Timer — Timetable</Text>
        <Text style={styles.status}>{status}</Text>

        {/* Year Selector */}
        <View style={styles.selectorRow}>
          <Text style={styles.selectorLabel}>Year:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
            {[1, 2, 3, 4].map((y) => (
              <TouchableOpacity
                key={y}
                style={[styles.selectorBtn, selectedYear === y && styles.selectorBtnActive]}
                onPress={() => setSelectedYear(y)}
              >
                <Text style={[styles.selectorBtnText, selectedYear === y && styles.selectorBtnTextActive]}>
                  Y{y}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Semester Selector */}
        <View style={styles.selectorRow}>
          <Text style={styles.selectorLabel}>Sem:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.selectorBtn, selectedSemester === s && styles.selectorBtnActive]}
                onPress={() => setSelectedSemester(s)}
              >
                <Text style={[styles.selectorBtnText, selectedSemester === s && styles.selectorBtnTextActive]}>
                  S{s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.semesterLabel}>
          {semesterKey} — {currentSemester.periods.length} periods, {DAYS.length} days
        </Text>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.rescheduleBtn} onPress={openEditor}>
            <Text style={styles.rescheduleBtnText}>Edit Periods</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => scheduleAll(currentSemester.periods)}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>Schedule Alarms</Text>
          </TouchableOpacity>
        </View>

        {/* Timetable Grid */}
        {DAYS.map((day) => (
          <View key={day} style={styles.day}>
            <Text style={styles.dayTitle}>{day}</Text>
            {currentSemester.periods.map((p, pIdx) => {
              const entry = currentSemester.timetable[day]?.[pIdx] || { subject: "", faculty: "" };
              const isEditingSubject =
                inlineEdit?.day === day && inlineEdit?.periodIdx === pIdx && inlineEdit?.field === "subject";
              const isEditingFaculty =
                inlineEdit?.day === day && inlineEdit?.periodIdx === pIdx && inlineEdit?.field === "faculty";

              return (
                <View key={`${day}-${p.period}`} style={styles.periodRow}>
                  <View style={styles.periodInfo}>
                    <Text style={[styles.periodNum, { fontSize }]}>{p.period}</Text>
                    <Text style={[styles.periodTime, { fontSize: isSmallScreen ? 10 : 12 }]}>
                      {formatTimeRange(p.time)}
                    </Text>
                  </View>
                  <View style={styles.periodFields}>
                    {isEditingSubject ? (
                      <TextInput
                        style={[styles.inlineInput, { fontSize }]}
                        value={inlineValue}
                        onChangeText={setInlineValue}
                        onBlur={commitInlineEdit}
                        autoFocus
                        placeholder="Subject"
                        placeholderTextColor="#999"
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.inlineText}
                        onPress={() => startInlineEdit(day, pIdx, "subject", entry.subject)}
                      >
                        <Text style={[styles.inlineTextLabel, { fontSize }, !entry.subject && styles.placeholderText]}>
                          {entry.subject || "Tap to add subject"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {isEditingFaculty ? (
                      <TextInput
                        style={[styles.inlineInput, { fontSize }]}
                        value={inlineValue}
                        onChangeText={setInlineValue}
                        onBlur={commitInlineEdit}
                        autoFocus
                        placeholder="Faculty"
                        placeholderTextColor="#999"
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.inlineText}
                        onPress={() => startInlineEdit(day, pIdx, "faculty", entry.faculty)}
                      >
                        <Text style={[styles.inlineTextLabel, { fontSize: isSmallScreen ? 11 : 12 }, !entry.faculty && styles.placeholderText]}>
                          {entry.faculty || "Tap to add faculty"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.footer}>Scheduled: {scheduled.length} alarms</Text>
      </ScrollView>

      {/* Period Editor Modal */}
      <Modal visible={showEditor} animationType="slide" transparent={false} onRequestClose={closeEditor}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Periods — {semesterKey}</Text>
            <TouchableOpacity onPress={closeEditor} style={styles.closeBtn}>
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
                  <TouchableOpacity onPress={() => removePeriod(index)} style={styles.deleteBtn}>
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

            <TouchableOpacity style={styles.addBtn} onPress={addPeriod}>
              <Text style={styles.addBtnText}>+ Add Period</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={saveAndReschedule}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save & Schedule"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeEditor}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { padding: 12, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  status: { fontSize: 13, color: "#555", marginBottom: 10 },
  selectorRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  selectorLabel: { fontSize: 14, fontWeight: "600", marginRight: 8, color: "#333" },
  selectorScroll: { flex: 1 },
  selectorBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#eee",
    marginRight: 6,
  },
  selectorBtnActive: { backgroundColor: "#2196F3" },
  selectorBtnText: { fontSize: 13, color: "#333", fontWeight: "600" },
  selectorBtnTextActive: { color: "#fff" },
  semesterLabel: { fontSize: 13, color: "#666", marginBottom: 8, fontStyle: "italic" },
  buttonRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  rescheduleBtn: {
    flex: 1,
    backgroundColor: "#2196F3",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  rescheduleBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  saveBtn: {
    flex: 1,
    backgroundColor: "#4CAF50",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
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
  periodInfo: { width: 80, alignItems: "center" },
  periodNum: { fontSize: 14, fontWeight: "bold", color: "#333" },
  periodTime: { fontSize: 11, color: "#666" },
  periodFields: { flex: 1, marginLeft: 8 },
  inlineText: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  inlineTextLabel: { fontSize: 13, color: "#333" },
  placeholderText: { color: "#999", fontStyle: "italic" },
  inlineInput: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#2196F3",
    fontSize: 13,
    color: "#333",
  },
  footer: { marginTop: 12, fontSize: 12, color: "#888" },

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
  closeBtn: { padding: 8 },
  closeBtnText: { fontSize: 20, color: "#fff", fontWeight: "bold" },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 20 },
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
  deleteBtn: { padding: 6 },
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
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalFooter: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  cancelBtn: {
    backgroundColor: "#999",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});