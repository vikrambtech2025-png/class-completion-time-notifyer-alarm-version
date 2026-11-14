import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  loadAccounts,
  createAccount,
  login,
  resetPassword,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "./auth";

const COOLDOWN_MS = 30000;
const MAX_FAILS = 5;

function BlackBtn({ label, hint, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.blackBtn, disabled && styles.blackBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={styles.blackBtnText}>{label}</Text>
      {hint ? <Text style={styles.blackBtnHint}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

export default function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [accounts, setAccounts] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resetStep, setResetStep] = useState(0);
  const [resetEmail, setResetEmail] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  useEffect(() => {
    (async () => {
      const a = await loadAccounts();
      setAccounts(a);
      if (a.length === 0) setMode("signup");
      else if (a.length === 1) setSelectedEmail(a[0].email);
    })();
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const inCooldown = cooldownUntil > now;
  const cooldownSec = Math.ceil((cooldownUntil - now) / 1000);

  function clearError() {
    setError("");
  }

  async function handleSignup() {
    clearError();
    const e = email;
    if (!validateEmail(e)) {
      setError("Enter a valid email address.");
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const acc = await createAccount({ email: e, password, name: "" });
      onSignedIn(acc);
    } catch (err) {
      setError(err.message || "Signup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    clearError();
    const targetEmail = selectedEmail || email;
    if (!validateEmail(targetEmail)) {
      setError("Select or enter an account email.");
      return;
    }
    if (inCooldown) {
      setError(`Too many attempts. Try again in ${cooldownSec}s.`);
      return;
    }
    setBusy(true);
    try {
      const acc = await login({ email: targetEmail, password });
      setFailed(0);
      onSignedIn(acc);
    } catch (err) {
      const n = failed + 1;
      setFailed(n);
      if (n >= MAX_FAILS) {
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        setFailed(0);
        setError("Too many failed attempts. Locked for 30 seconds.");
      } else {
        setError(err.message || "Login failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResetStart() {
    clearError();
    const e = normalizeEmail(resetEmail);
    if (!validateEmail(e)) {
      setError("Enter a valid email address.");
      return;
    }
    const a = await loadAccounts();
    if (!a.some((x) => x.email === e)) {
      setError("No account found for this email.");
      return;
    }
    setResetStep(1);
  }

  function handleResetConfirm() {
    clearError();
    if (resetConfirm.trim().toUpperCase() !== "RESET") {
      setError('Type "RESET" exactly to confirm.');
      return;
    }
    setResetStep(2);
  }

  async function handleResetFinish() {
    clearError();
    const pwErr = validatePassword(newPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== newConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const acc = await resetPassword({ email: resetEmail, newPassword });
      onSignedIn(acc);
    } catch (err) {
      setError(err.message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  function renderLogin() {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Staff Login</Text>
        {accounts.length > 0 && (
          <View style={styles.accountList}>
            {accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.accountChip,
                  selectedEmail === a.email && styles.accountChipActive,
                ]}
                onPress={() => {
                  setSelectedEmail(a.email);
                  setEmail(a.email);
                  clearError();
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.accountChipText,
                    selectedEmail === a.email && styles.accountChipTextActive,
                  ]}
                >
                  {a.name} ({a.email})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {accounts.length === 0 && (
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              clearError();
            }}
            placeholder="Email"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        )}
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clearError();
          }}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry={!showPw}
        />
        <TouchableOpacity onPress={() => setShowPw((s) => !s)} activeOpacity={0.7}>
          <Text style={styles.link}>{showPw ? "Hide password" : "Show password"}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {inCooldown ? (
          <Text style={styles.cooldown}>Locked for {cooldownSec}s</Text>
        ) : null}
        <BlackBtn
          label={busy ? "Signing in..." : "Log In"}
          hint="Enter your staff password"
          onPress={handleLogin}
          disabled={busy || inCooldown}
        />
        <TouchableOpacity
          onPress={() => {
            setResetEmail(selectedEmail || email || "");
            setResetStep(0);
            setResetConfirm("");
            setNewPassword("");
            setNewConfirm("");
            clearError();
            setMode("reset");
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.link}>Forgot password?</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            clearError();
            setEmail("");
            setPassword("");
            setConfirm("");
            setMode("signup");
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.link}>Add a staff account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderSignup() {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create Staff Account</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clearError();
          }}
          placeholder="Email"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clearError();
          }}
          placeholder="Password (min 8 chars, 1 letter + 1 number)"
          placeholderTextColor="#999"
          secureTextEntry={!showPw}
        />
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v);
            clearError();
          }}
          placeholder="Confirm password"
          placeholderTextColor="#999"
          secureTextEntry={!showPw}
        />
        <TouchableOpacity onPress={() => setShowPw((s) => !s)} activeOpacity={0.7}>
          <Text style={styles.link}>{showPw ? "Hide password" : "Show password"}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BlackBtn
          label={busy ? "Creating..." : "Create Account"}
          hint="Save staff login"
          onPress={handleSignup}
          disabled={busy}
        />
        {accounts.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              clearError();
              setMode("login");
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.link}>Back to login</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderReset() {
    if (resetStep === 0) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reset Password</Text>
          <Text style={styles.info}>
            Enter the account email. Schedule and alarms stay untouched.
          </Text>
          <TextInput
            style={styles.input}
            value={resetEmail}
            onChangeText={(v) => {
              setResetEmail(v);
              clearError();
            }}
            placeholder="Email"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <BlackBtn
            label="Continue"
            hint="Verify account email"
            onPress={handleResetStart}
            disabled={busy}
          />
          <TouchableOpacity
            onPress={() => {
              clearError();
              setMode("login");
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.link}>Back to login</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (resetStep === 1) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Confirm Reset</Text>
          <Text style={styles.info}>
            Type RESET to confirm. This only clears this account&apos;s password.
          </Text>
          <TextInput
            style={styles.input}
            value={resetConfirm}
            onChangeText={(v) => {
              setResetConfirm(v);
              clearError();
            }}
            placeholder='Type "RESET"'
            placeholderTextColor="#999"
            autoCapitalize="characters"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <BlackBtn
            label="Confirm"
            hint="Proceed to new password"
            onPress={handleResetConfirm}
            disabled={busy}
          />
          <TouchableOpacity
            onPress={() => {
              clearError();
              setResetStep(0);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.link}>Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Set New Password</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={(v) => {
            setNewPassword(v);
            clearError();
          }}
          placeholder="New password (min 8 chars, 1 letter + 1 number)"
          placeholderTextColor="#999"
          secureTextEntry={!showPw}
        />
        <TextInput
          style={styles.input}
          value={newConfirm}
          onChangeText={(v) => {
            setNewConfirm(v);
            clearError();
          }}
          placeholder="Confirm new password"
          placeholderTextColor="#999"
          secureTextEntry={!showPw}
        />
        <TouchableOpacity onPress={() => setShowPw((s) => !s)} activeOpacity={0.7}>
          <Text style={styles.link}>{showPw ? "Hide password" : "Show password"}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BlackBtn
          label={busy ? "Saving..." : "Save New Password"}
          hint="Update account password"
          onPress={handleResetFinish}
          disabled={busy}
        />
        <TouchableOpacity
          onPress={() => {
            clearError();
            setResetStep(1);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Period Timer — Staff Access</Text>
        <Text style={styles.subtitle}>Sign in to edit periods and schedule alarms</Text>
        {mode === "login" && renderLogin()}
        {mode === "signup" && renderSignup()}
        {mode === "reset" && renderReset()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { padding: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: "bold", color: "#000", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 20 },
  card: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardTitle: { fontSize: 18, fontWeight: "bold", color: "#000", marginBottom: 12, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#000",
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  accountList: { marginBottom: 10 },
  accountChip: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#eee",
    marginBottom: 6,
  },
  accountChipActive: { backgroundColor: "#2196F3" },
  accountChipText: { fontSize: 14, color: "#333" },
  accountChipTextActive: { color: "#fff", fontWeight: "600" },
  blackBtn: {
    backgroundColor: "#000",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  blackBtnDisabled: { opacity: 0.5 },
  blackBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  blackBtnHint: { color: "#fff", fontSize: 12, fontWeight: "bold", marginTop: 2, textAlign: "center" },
  link: { color: "#2196F3", fontSize: 14, textAlign: "center", marginTop: 8, padding: 4 },
  error: { color: "#d32f2f", fontSize: 13, marginTop: 4, marginBottom: 4, textAlign: "center" },
  cooldown: { color: "#f57c00", fontSize: 13, textAlign: "center", marginBottom: 4 },
  info: { fontSize: 13, color: "#666", marginBottom: 10, textAlign: "center" },
});