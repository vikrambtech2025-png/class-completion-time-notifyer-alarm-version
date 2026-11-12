import re

with open('App.js', 'r') as f:
    content = f.read()

# Find the TimePicker function
start = content.index('function TimePicker(')
end = content.index('const timePickerStyles', start)

new_func = r'''function TimePicker({ time24, onChange }) {
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

'''

content = content[:start] + new_func + content[end:]

# Update styles
old_styles_start = content.index('const timePickerStyles = StyleSheet.create({')
old_styles_end = content.index('});', old_styles_start) + 3
old_styles = content[old_styles_start:old_styles_end]

new_styles = '''const timePickerStyles = StyleSheet.create({
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
});'''

content = content[:old_styles_start] + new_styles + content[old_styles_end:]

with open('App.js', 'w') as f:
    f.write(content)
print('Done')
"