import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const ACCOUNTS_KEY = "@period_timer_accounts";
const SESSION_KEY = "@period_timer_session";
const ROUNDS = 1500;

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(pw) {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw)) return "Password must contain a letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain a number.";
  return null;
}

async function loadAccounts() {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

async function saveAccounts(accounts) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function randomSalt() {
  const bytes = Crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hashPassword(password, salt) {
  let input = salt + password;
  for (let i = 0; i < ROUNDS; i++) {
    input = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input
    );
  }
  return input;
}

async function createAccount({ email, password, name }) {
  const e = normalizeEmail(email);
  if (!validateEmail(e)) throw new Error("Enter a valid email address.");
  const pwErr = validatePassword(password);
  if (pwErr) throw new Error(pwErr);
  const accounts = await loadAccounts();
  if (accounts.some((a) => a.email === e)) {
    throw new Error("An account with this email already exists.");
  }
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const account = {
    id: Crypto.randomUUID(),
    email: e,
    name: (name || "").trim() || e.split("@")[0],
    salt,
    hash,
    rounds: ROUNDS,
    createdAt: Date.now(),
  };
  accounts.push(account);
  await saveAccounts(accounts);
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ email: e, at: Date.now() }));
  return account;
}

async function login({ email, password }) {
  const e = normalizeEmail(email);
  const accounts = await loadAccounts();
  const account = accounts.find((a) => a.email === e);
  if (!account) throw new Error("No account found for this email.");
  const hash = await hashPassword(password, account.salt);
  if (hash !== account.hash) throw new Error("Incorrect password.");
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ email: e, at: Date.now() }));
  return account;
}

async function getSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.email) return null;
    const accounts = await loadAccounts();
    if (!accounts.some((a) => a.email === parsed.email)) return null;
    return parsed;
  } catch (_e) {
    return null;
  }
}

async function signOut() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

async function resetPassword({ email, newPassword }) {
  const e = normalizeEmail(email);
  const pwErr = validatePassword(newPassword);
  if (pwErr) throw new Error(pwErr);
  const accounts = await loadAccounts();
  const idx = accounts.findIndex((a) => a.email === e);
  if (idx === -1) throw new Error("No account found for this email.");
  const salt = randomSalt();
  const hash = await hashPassword(newPassword, salt);
  accounts[idx] = { ...accounts[idx], salt, hash, rounds: ROUNDS };
  await saveAccounts(accounts);
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ email: e, at: Date.now() }));
  return accounts[idx];
}

async function removeAccount(email) {
  const e = normalizeEmail(email);
  const accounts = await loadAccounts();
  const next = accounts.filter((a) => a.email !== e);
  if (next.length === accounts.length) throw new Error("Account not found.");
  await saveAccounts(next);
  const session = await getSession();
  if (session && session.email === e) await signOut();
}

async function changePassword({ email, oldPassword, newPassword }) {
  const e = normalizeEmail(email);
  const accounts = await loadAccounts();
  const idx = accounts.findIndex((a) => a.email === e);
  if (idx === -1) throw new Error("No account found for this email.");
  const oldHash = await hashPassword(oldPassword, accounts[idx].salt);
  if (oldHash !== accounts[idx].hash) throw new Error("Current password is incorrect.");
  const pwErr = validatePassword(newPassword);
  if (pwErr) throw new Error(pwErr);
  const salt = randomSalt();
  const hash = await hashPassword(newPassword, salt);
  accounts[idx] = { ...accounts[idx], salt, hash, rounds: ROUNDS };
  await saveAccounts(accounts);
  return accounts[idx];
}

export {
  normalizeEmail,
  validateEmail,
  validatePassword,
  loadAccounts,
  createAccount,
  login,
  getSession,
  signOut,
  resetPassword,
  removeAccount,
  changePassword,
};

export const ACCOUNTS_STORAGE_KEY = ACCOUNTS_KEY;
export const SESSION_STORAGE_KEY = SESSION_KEY;