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
// Custom scrollable time picker (no native picker dependency)
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthScreen from "./src/AuthScreen";
import { getSession, signOut } from "./src/auth";

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

// Convert 24h time (HH:MM) to 12h components {hour, minute, period}
function to12h(time24) {
  if (!validateTime(time24)) return { hour: 12, minute: 0, period: "AM" };
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return { hour, minute: m, period };
}

// Convert 12h components to 24h time (HH:MM)
function to24h(hour, minute, period) {
  let h = hour;
  if (period === "AM") {
    h = hour === 12 ? 0 : hour;
  } else {
    h = hour === 12 ? 12 : hour + 12;
  }
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

const STORAGE_KEY = "@period_timer_schedule";

// Scrollable Time Picker with AM/PM (custom, no native dependency)
// Scrollable Time Picker with AM/PM
function TimePicker({ time24, onChange }) {
  const parsed = to12h(time24);
  const [hour, setHour] = useState(String(parsed.hour));
  const [minute, setMinute] = useState(String(parsed.minute).padStart(2, '0'));
  const [period, setPeriod] = useState(parsed.period);

  const handleChange = () => {
    const h = parseInt(hour, 10) || 12;
    const m = parseInt(minute, 10) || 0;
    const clampedH = Math.max(1, Math.min(12, h));
    const clampedM = Math.max(0, Math.min(59, m));
    const t = to24h(clampedH, clampedM, period);
    onChange(t);
  };

  return (
    <View style={timePickerStyles.container}>
      <View style={timePickerStyles.inputRow}>
        <TextInput
          style={timePickerStyles.timeInput}
          value={hour}
          onChangeText={(v) => setHour(v)}
          onBlur={handleChange}
          placeholder="12"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={timePickerStyles.separator}>:</Text>
        <TextInput
          style={timePickerStyles.timeInput}
          value={minute}
          onChangeText={(v) => setMinute(v)}
          onBlur={handleChange}
          placeholder="00"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={2}
        />
      </View>
      {/* AM/PM Radio Buttons */}
      <View style={timePickerStyles.radioRow}>
        <TouchableOpacity
          style={timePickerStyles.radioBtn}
          onPress={() => { setPeriod("AM"); handleChange(); }}
          activeOpacity={0.7}
        >
          <View style={[timePickerStyles.radioCircle, period === "AM" && timePickerStyles.radioCircleActive]}>
            {period === "AM" && <View style={timePickerStyles.radioDot} />}
          </View>
          <Text style={[timePickerStyles.radioLabel, period === "AM" && timePickerStyles.radioLabelActive]}>AM</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={timePickerStyles.radioBtn}
          onPress={() => { setPeriod("PM"); handleChange(); }}
          activeOpacity={0.7}
        >
          <View style={[timePickerStyles.radioCircle, period === "PM" && timePickerStyles.radioCircleActive]}>
            {period === "PM" && <View style={timePickerStyles.radioDot} />}
          </View>
          <Text style={[timePickerStyles.radioLabel, period === "PM" && timePickerStyles.radioLabelActive]}>PM</Text>
        </TouchableOpacity>
      </View>
      <Text style={timePickerStyles.preview}>{formatTime12h(to24h(parseInt(hour, 10) || 12, parseInt(minute, 10) || 0, period))}</Text>
    </View>
  );
}

const timePickerStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timeInput: {
    width: 50,
    height: 44,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
    color: "#2196F3",
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  separator: { fontSize: 24, fontWeight: "bold", color: "#333", paddingHorizontal: 8 },
  preview: { fontSize: 12, color: "#2196F3", fontWeight: "600", textAlign: "center", marginTop: 4 },
  radioRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    gap: 20,
  },
  radioBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#999",
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  radioCircleActive: {
    borderColor: "#2196F3",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2196F3",
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  radioLabelActive: {
    color: "#2196F3",
  },
});

export default function App() {
  const [status, setStatus] = useState("Initializing...");
  const [scheduled, setScheduled] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editPeriods, setEditPeriods] = useState([]);
  const [editTimetable, setEditTimetable] = useState({});
  const [editingDay, setEditingDay] = useState("Monday");
  const [saving, setSaving] = useState(false);
  // (inline editing removed - main page cleared)
  // (upload/OCR removed - only edit periods and schedule alarms remain)
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [authReady, setAuthReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState(null);

  const screenData = Dimensions.get("window");
  const isSmallScreen = screenData.width < 360;

  async function handleSignedIn(acc) {
    if (acc && acc.email) setSessionEmail(acc.email);
  }
  async function handleSignOut() {
    await signOut();
    setSessionEmail(null);
  }

  useEffect(() => {
    (async () => {
      try {
        const sess = await getSession();
        if (sess && sess.email) setSessionEmail(sess.email);
      } catch (_e) {}
      setAuthReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setSchedule(JSON.parse(raw));
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

      setStatus("Ready - edit periods and schedule alarms");
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

  const DAY_TO_WEEKDAY = {
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6,
    Saturday: 7,
  };

  async function scheduleAll(scheduleObj) {
    const sched = scheduleObj && scheduleObj.periods ? scheduleObj : { periods: scheduleObj || [], timetable: {} };
    await Notifications.cancelAllScheduledNotificationsAsync();
    const items = [];
    for (const day of DAYS) {
      const weekday = DAY_TO_WEEKDAY[day];
      if (!weekday) continue;
      const dayEntries = (sched.timetable && sched.timetable[day]) || [];
      for (let i = 0; i < sched.periods.length; i++) {
        const pt = sched.periods[i];
        const [start] = (pt.time || "").split("-");
        if (!validateTime(start)) continue;
        const s = parseTime(start);
        const entry = dayEntries[i] || { subject: "", faculty: "" };
        const name = pt.name || `Period ${pt.period}`;
        const subject = (entry.subject || "").trim();
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Period ${pt.period}: ${name}`,
            body: `${day} - ${subject || "No subject"} - ${formatTimeRange(pt.time)}`,
            priority: 2,
            sticky: true,
            autoDismiss: false,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: s.h,
            minute: s.m,
            channelId: "period-alarms-v3",
          },
        });
        items.push({ day, period: pt.period, time: pt.time, name, subject, id });
      }
    }
    setScheduled(items);
    setStatus(`Scheduled ${items.length} period alarms (${DAYS.length} days)`);
  }


  function openEditor() {
    setEditPeriods(currentSchedule.periods.map((p) => ({ ...p })));
    setEditTimetable(JSON.parse(JSON.stringify(currentSchedule.timetable)));
    setEditingDay("Monday");
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
    await scheduleAll(updated);
    setSaving(false);
    setShowEditor(false);
  }

  // (inline editing removed - main page cleared)

  const titleSize = isSmallScreen ? 18 : 22;

  if (!authReady) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.status}>Loading...</Text>
      </SafeAreaView>
    );
  }
  if (!sessionEmail) {
    return <AuthScreen onSignedIn={handleSignedIn} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { fontSize: titleSize }]}>Period Timer — Timetable</Text>
        <Text style={styles.status}>{status}</Text>

        {/* Staff session header */}
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionEmail} numberOfLines={1}>
            Signed in: {sessionEmail}
          </Text>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Day Selector */}
        <View style={styles.daySelectorRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daySelectorScroll}>
            {DAYS.map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.daySelectorBtn, selectedDay === day && styles.daySelectorBtnActive]}
                onPress={() => setSelectedDay(day)}
                activeOpacity={0.7}
              >
                <Text style={[styles.daySelectorText, selectedDay === day && styles.daySelectorTextActive]}>
                  {day.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Timetable Display - Selected Day Only */}
        <View style={styles.dayCard}>
          <Text style={styles.dayTitle}>{selectedDay}</Text>
          {currentSchedule.periods.map((p, pIdx) => {
            const entry = currentSchedule.timetable[selectedDay]?.[pIdx] || { subject: "", faculty: "" };
            return (
              <View key={`${selectedDay}-${p.period}`} style={styles.periodRow}>
                <View style={styles.periodInfo}>
                  <Text style={styles.periodNum}>{p.period}</Text>
                  <Text style={styles.periodName}>{p.name || `P${p.period}`}</Text>
                  <Text style={styles.periodTime}>{formatTimeRange(p.time)}</Text>
                </View>
                <View style={styles.periodDetails}>
                  <Text style={[styles.detailText, !entry.subject && styles.placeholderText]}>
                    {entry.subject || "No subject"}
                  </Text>
                  <Text style={[styles.detailText, !entry.faculty && styles.placeholderText, styles.facultyText]}>
                    {entry.faculty || "No faculty"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.footer}>Scheduled: {scheduled.length} alarms</Text>
      </ScrollView>

      {/* Period Editor Modal */}
      <Modal visible={showEditor} animationType="slide" transparent={false} onRequestClose={closeEditor}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Periods</Text>
            <TouchableOpacity onPress={closeEditor} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Day Selector Tabs */}
          <View style={styles.modalDayRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {DAYS.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.modalDayBtn, editingDay === day && styles.modalDayBtnActive]}
                  onPress={() => setEditingDay(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalDayText, editingDay === day && styles.modalDayTextActive]}>
                    {day.substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {editPeriods.map((p, index) => {
              const entry = editTimetable[editingDay]?.[index] || { subject: "", faculty: "" };
              return (
              <View key={index} style={styles.periodCard}>
                <View style={styles.periodCardHeader}>
                  <View style={styles.periodBadge}>
                    <Text style={styles.periodBadgeText}>P{index + 1}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removePeriod(index)} style={styles.deleteBtn} activeOpacity={0.7}>
                    <Text style={styles.deleteBtnText}>Del</Text>
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

                <Text style={styles.fieldLabel}>Start Time</Text>
                <TimePicker
                  time24={(p.time || "09:00-09:45").split("-")[0]}
                  onChange={(t) => {
                    const end = (p.time || "").split("-")[1] || "09:45";
                    updateEditPeriod(index, "time", `${t}-${end}`);
                  }}
                />
                <Text style={styles.fieldLabel}>End Time</Text>
                <TimePicker
                  time24={(p.time || "09:00-09:45").split("-")[1] || "09:45"}
                  onChange={(t) => {
                    const start = (p.time || "").split("-")[0] || "09:00";
                    updateEditPeriod(index, "time", `${start}-${t}`);
                  }}
                />
                <Text style={styles.timePreview}>{formatTimeRange(p.time)}</Text>

                <Text style={styles.fieldLabel}>Subject ({editingDay})</Text>
                <TextInput
                  style={styles.input}
                  value={entry.subject || ""}
                  onChangeText={(v) => {
                    setEditTimetable((prev) => {
                      const next = { ...prev };
                      if (!next[editingDay]) next[editingDay] = [];
                      if (!next[editingDay][index]) next[editingDay][index] = { period: index + 1, subject: "", faculty: "" };
                      next[editingDay][index] = { ...next[editingDay][index], subject: v };
                      return next;
                    });
                  }}
                  placeholder="e.g., Mathematics"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Faculty ({editingDay})</Text>
                <TextInput
                  style={styles.input}
                  value={entry.faculty || ""}
                  onChangeText={(v) => {
                    setEditTimetable((prev) => {
                      const next = { ...prev };
                      if (!next[editingDay]) next[editingDay] = [];
                      if (!next[editingDay][index]) next[editingDay][index] = { period: index + 1, subject: "", faculty: "" };
                      next[editingDay][index] = { ...next[editingDay][index], faculty: v };
                      return next;
                    });
                  }}
                  placeholder="e.g., Dr. Smith"
                  placeholderTextColor="#999"
                />
              </View>
            );
            })}

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
          style={styles.bottomBtn}
          onPress={openEditor}
          activeOpacity={0.7}
        >
          <Text style={styles.bottomBtnText}>Edit Periods</Text>
          <Text style={styles.btnHint}>Change times & names</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, saving && styles.saveBtnDisabled]}
          onPress={() => {
            scheduleAll(currentSchedule);
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

  day: { marginBottom: 10, padding: 8, backgroundColor: "#f2f2f2", borderRadius: 8 },
  dayCard: { marginBottom: 10, padding: 8, backgroundColor: "#f2f2f2", borderRadius: 8 },
  daySelectorRow: { marginBottom: 10 },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
  },
  sessionEmail: { fontSize: 13, color: "#333", fontWeight: "600", flex: 1, marginRight: 8 },
  signOutBtn: {
    backgroundColor: "#000",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  signOutText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  daySelectorScroll: { flexGrow: 0 },
  daySelectorBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#eee",
    marginRight: 6,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  daySelectorBtnActive: { backgroundColor: "#2196F3" },
  daySelectorText: { fontSize: 13, color: "#333", fontWeight: "600" },
  daySelectorTextActive: { color: "#fff" },
  periodDetails: { flex: 1, marginLeft: 8 },
  detailText: { fontSize: 13, color: "#333" },
  facultyText: { fontSize: 12, color: "#666" },
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
    backgroundColor: "#000000",
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
  modalDayRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalDayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#eee",
    marginRight: 6,
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  modalDayBtnActive: { backgroundColor: "#2196F3" },
  modalDayText: { fontSize: 12, color: "#333", fontWeight: "600" },
  modalDayTextActive: { color: "#fff" },
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