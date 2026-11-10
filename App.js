import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, Modal, TextInput, TouchableOpacity, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import timetableData from "./timetable.json";

// Remove expo-av import and usage to fix native library crash

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

export default function App() {
  const [status, setStatus] = useState("Initializing...");
  const [scheduled, setScheduled] = useState([]);
  const [periods, setPeriods] = useState(timetableData.periods.map((p) => ({ ...p })));
  const [showEditor, setShowEditor] = useState(false);
  const [editPeriods, setEditPeriods] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!Device.isDevice) {
        setStatus("Must run on a physical device");
        return;
      }
      const { status: existing } = await Notifications.getPermissionsAsync();
      let final = existing;
      if (existing !== "granted") {
        // Show alert to user about why permission is needed
        Alert.alert(
          "Notification Permission Required",
          "This app needs notification permission to schedule period alarms. Please tap 'Allow' on the next screen.",
          [{ text: "OK" }]
        );
        const { status } = await Notifications.requestPermissionsAsync();
        final = status;
      }
      if (final !== "granted") {
        setStatus("Notification permission DENIED - alarms will not work! Go to Settings > Apps > Period Timer > Notifications and enable.");
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
          importance: 5, // AndroidImportance.MAX
          sound: "buzzer",
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: 1, // AndroidNotificationVisibility.PUBLIC
          bypassDnd: true,
        });
      }

      await scheduleAll(periods);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scheduleAll(periodList) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const items = [];
    for (const pt of periodList) {
      const [start] = pt.time.split("-");
      if (!validateTime(start)) continue;
      const s = parseTime(start);
      const when = nextOccurrence(s.h, s.m);
      const name = pt.name || `Period ${pt.period}`;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Period ${pt.period}: ${name}`,
          body: `${name} — ${formatTimeRange(pt.time)}`,
          priority: 2, // AndroidNotificationPriority.MAX
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

  function openEditor() {
    setEditPeriods(periods.map((p) => ({ ...p })));
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
  }

  function removePeriod(index) {
    setEditPeriods((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveAndReschedule() {
    // Validate all times
    for (const p of editPeriods) {
      const [start, end] = p.time.split("-");
      if (!validateTime(start) || !validateTime(end)) {
        Alert.alert("Invalid Time", `Period ${p.period} has invalid time format. Use HH:MM-HH:MM (e.g., 09:00-09:45)`);
        return;
      }
    }
    setSaving(true);
    const updated = editPeriods.map((p, i) => ({ ...p, period: i + 1 }));
    setPeriods(updated);
    await scheduleAll(updated);
    setSaving(false);
    setShowEditor(false);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Period Timer — Timetable</Text>
        <Text style={styles.status}>{status}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.rescheduleBtn} onPress={openEditor}>
            <Text style={styles.rescheduleBtnText}>Reschedule / Edit Periods</Text>
          </TouchableOpacity>
        </View>

        {Object.keys(timetableData.timetable).map((day) => (
          <View key={day} style={styles.day}>
            <Text style={styles.dayTitle}>{day}</Text>
            {timetableData.timetable[day].map((e, i) => {
              const ps = e.periods || [e.period];
              return ps.map((p) => {
                const pt = periods.find((x) => x.period === p);
                const timeStr = pt ? formatTimeRange(pt.time) : "";
                return (
                  <Text key={`${day}-${p}-${i}`} style={styles.row}>
                    P{p} {timeStr} — {e.subject} ({Array.isArray(e.faculty) ? e.faculty.join(",") : e.faculty})
                  </Text>
                );
              });
            })}
          </View>
        ))}
        <Text style={styles.footer}>Scheduled: {scheduled.length} alarms</Text>
      </ScrollView>

      {/* Period Editor Modal */}
      <Modal visible={showEditor} animationType="slide" transparent={false} onRequestClose={closeEditor}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Periods</Text>
            <TouchableOpacity onPress={closeEditor} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>X</Text>
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
                    <Text style={styles.deleteBtnText}>Del</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Period Name</Text>
                <TextInput
                  style={styles.input}
                  value={p.name || ""}
                  onChangeText={(v) => updateEditPeriod(index, "name", v)}
                  placeholder="e.g., Mathematics"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Time (HH:MM-HH:MM)</Text>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={p.time.split("-")[0] || ""}
                    onChangeText={(v) => {
                      const end = p.time.split("-")[1] || "";
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
                    value={p.time.split("-")[1] || ""}
                    onChangeText={(v) => {
                      const start = p.time.split("-")[0] || "";
                      updateEditPeriod(index, "time", `${start}-${v}`);
                    }}
                    placeholder="09:45"
                    placeholderTextColor="#999"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                <Text style={styles.timePreview}>
                  {formatTimeRange(p.time)}
                </Text>
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
              <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save & Reschedule"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeEditor}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  status: { fontSize: 14, color: "#555", marginBottom: 12 },
  buttonRow: { marginBottom: 16 },
  rescheduleBtn: {
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  rescheduleBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  day: { marginBottom: 12, padding: 8, backgroundColor: "#f2f2f2", borderRadius: 8 },
  dayTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  row: { fontSize: 13, marginLeft: 8, marginBottom: 2 },
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
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  closeBtn: { padding: 8 },
  closeBtnText: { fontSize: 22, color: "#fff", fontWeight: "bold" },
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
  timeInput: {
    flex: 1,
    textAlign: "center",
  },
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
  saveBtn: {
    backgroundColor: "#2196F3",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  cancelBtn: {
    backgroundColor: "#999",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
