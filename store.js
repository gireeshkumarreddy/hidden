// Accounts and saved data for Hidden Stories.
// With a Firebase config in firebase-config.js this talks to Firebase Auth + Firestore.
// Without one it runs in demo mode: everything is kept in this browser's storage only.
import { firebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '10.12.2';

export const nightsOf = (checkIn, checkOut) => {
  const nights = [];
  for (let date = new Date(`${checkIn}T12:00:00`), end = new Date(`${checkOut}T12:00:00`); date < end; date.setDate(date.getDate() + 1)) {
    nights.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
  }
  return nights;
};
const bookingCode = stayId => `HST-${stayId.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export class FriendlyError extends Error {}

const authMessages = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'There is no account with this email yet. Create one instead.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Please choose a password of at least 8 characters.',
  'auth/missing-password': 'Please enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/cancelled-popup-request': 'The Google window was closed before signing in.',
  'auth/invalid-phone-number': 'Please enter a valid mobile number, for example +91 98765 43210.',
  'auth/missing-phone-number': 'Please enter your mobile number.',
  'auth/invalid-verification-code': 'That code is not right. Check the SMS and try again.',
  'auth/code-expired': 'That code has expired. Request a new one.',
  'auth/captcha-check-failed': 'The security check failed. Please try again.',
  'auth/quota-exceeded': 'SMS sign-in is busy right now. Please try email or Google.',
  'auth/operation-not-allowed': 'This sign-in method has not been switched on yet in Firebase.',
  'auth/unauthorized-domain': 'This website address is not yet authorised for sign-in in Firebase.',
  'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
  'permission-denied': 'That action is not allowed. Please sign in again.'
};
export const friendly = error => error instanceof FriendlyError ? error.message : (authMessages[error?.code] || 'Something went wrong. Please try again.');

export async function createStore() {
  if (firebaseConfig?.apiKey) {
    try { return await firebaseStore(firebaseConfig); }
    catch (error) { console.error('Firebase could not start; using demo mode instead.', error); }
  }
  return demoStore();
}

/* ---------------------------------------------------------------- Firebase */
async function firebaseStore(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, A, F] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  auth.useDeviceLanguage();
  const db = F.getFirestore(app);
  const listeners = new Set();
  let user = null, confirmation = null, verifier = null;

  const toUser = account => account && {
    uid: account.uid, name: account.displayName || '', email: account.email || '', phone: account.phoneNumber || '',
    verified: account.emailVerified, provider: account.providerData[0]?.providerId || 'password'
  };
  const userRef = () => F.doc(db, 'users', user.uid);
  const emit = () => listeners.forEach(callback => callback(user));
  const ensureProfile = async account => {
    const ref = F.doc(db, 'users', account.uid);
    const snapshot = await F.getDoc(ref);
    if (!snapshot.exists()) await F.setDoc(ref, { name: account.displayName || '', email: account.email || '', phone: account.phoneNumber || '', wishlist: [], createdAt: F.serverTimestamp() });
  };
  const signedIn = () => { if (!user) throw new FriendlyError('Please sign in first.'); return user; };
  const wrap = async task => { try { return await task(); } catch (error) { throw new FriendlyError(friendly(error)); } };

  await new Promise(resolve => { const stop = A.onAuthStateChanged(auth, account => { user = toUser(account); stop(); resolve(); }); });
  A.onAuthStateChanged(auth, async account => {
    user = toUser(account);
    if (account) await ensureProfile(account).catch(console.error);
    emit();
  });

  return {
    mode: 'firebase',
    get user() { return user; },
    onAuth(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    signUpEmail: ({ name, email, password }) => wrap(async () => {
      const credential = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.updateProfile(credential.user, { displayName: name });
      await F.setDoc(F.doc(db, 'users', credential.user.uid), { name, email, phone: '', wishlist: [], createdAt: F.serverTimestamp() }, { merge: true });
      A.sendEmailVerification(credential.user).catch(() => {});
      user = toUser(auth.currentUser); emit();
    }),
    signInEmail: ({ email, password }) => wrap(() => A.signInWithEmailAndPassword(auth, email, password)),
    resetPassword: email => wrap(() => A.sendPasswordResetEmail(auth, email)),
    signInGoogle: () => wrap(() => A.signInWithPopup(auth, new A.GoogleAuthProvider())),
    sendOtp: (phone, container) => wrap(async () => {
      verifier?.clear();
      verifier = new A.RecaptchaVerifier(auth, container, { size: 'invisible' });
      confirmation = await A.signInWithPhoneNumber(auth, phone, verifier);
      return {};
    }),
    verifyOtp: code => wrap(async () => {
      if (!confirmation) throw new FriendlyError('Request a code first.');
      await confirmation.confirm(code);
    }),
    signOut: () => A.signOut(auth),
    profile: () => wrap(async () => (await F.getDoc(userRef())).data() || {}),
    saveProfile: ({ name, phone }) => wrap(async () => {
      signedIn();
      await F.setDoc(userRef(), { name, phone, updatedAt: F.serverTimestamp() }, { merge: true });
      if (name && auth.currentUser.displayName !== name) await A.updateProfile(auth.currentUser, { displayName: name });
      user = { ...toUser(auth.currentUser), name }; emit();
    }),
    getWishlist: () => wrap(async () => ((await F.getDoc(userRef())).data()?.wishlist) || []),
    setWish: (stayId, saved) => wrap(() => F.setDoc(userRef(), { wishlist: saved ? F.arrayUnion(stayId) : F.arrayRemove(stayId) }, { merge: true })),
    mergeWishlist: ids => wrap(() => ids.length ? F.setDoc(userRef(), { wishlist: F.arrayUnion(...ids) }, { merge: true }) : null),
    listBookings: () => wrap(async () => {
      const snapshot = await F.getDocs(F.query(F.collection(db, 'bookings'), F.where('uid', '==', signedIn().uid)));
      return snapshot.docs.map(item => ({ id: item.id, ...item.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }),
    createBooking: input => wrap(async () => {
      const { uid } = signedIn();
      const nights = nightsOf(input.checkIn, input.checkOut);
      const ref = F.doc(F.collection(db, 'bookings'));
      const batch = F.writeBatch(db);
      const booking = { ...input, uid, nights: nights.length, ref: bookingCode(input.stayId), createdAt: F.serverTimestamp() };
      batch.set(ref, booking);
      // One document per night: if any night is already taken the whole booking is refused.
      nights.forEach(date => batch.set(F.doc(db, 'nights', `${input.stayId}_${date}`), { stayId: input.stayId, date, uid, bookingId: ref.id }));
      batch.set(userRef(), { name: input.guest.name, phone: input.guest.phone, updatedAt: F.serverTimestamp() }, { merge: true });
      try { await batch.commit(); }
      catch (error) {
        if (error?.code === 'permission-denied') throw new FriendlyError('Some of these nights were just booked by someone else. Please choose different dates.');
        throw error;
      }
      return { id: ref.id, ...booking, createdAt: { seconds: Date.now() / 1000 } };
    }),
    cancelBooking: id => wrap(async () => {
      const { uid } = signedIn();
      const ref = F.doc(db, 'bookings', id);
      const booking = (await F.getDoc(ref)).data();
      const batch = F.writeBatch(db);
      batch.update(ref, { status: 'cancelled', cancelledAt: F.serverTimestamp() });
      nightsOf(booking.checkIn, booking.checkOut).forEach(date => batch.delete(F.doc(db, 'nights', `${booking.stayId}_${date}`)));
      await batch.commit();
      return uid;
    }),
    bookedNights: stayId => wrap(async () => {
      const snapshot = await F.getDocs(F.query(F.collection(db, 'nights'), F.where('stayId', '==', stayId)));
      return new Set(snapshot.docs.map(item => item.data().date));
    }),
    unavailableStays: dates => wrap(async () => {
      const taken = new Set();
      for (const group of chunk(dates, 30)) {
        const snapshot = await F.getDocs(F.query(F.collection(db, 'nights'), F.where('date', 'in', group)));
        snapshot.docs.forEach(item => taken.add(item.data().stayId));
      }
      return taken;
    }),
    listThreads: () => wrap(async () => {
      const snapshot = await F.getDocs(F.query(F.collection(db, 'threads'), F.where('uid', '==', signedIn().uid)));
      return snapshot.docs.map(item => ({ id: item.id, ...item.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    }),
    openThread: (stay, hostName) => wrap(async () => {
      const { uid } = signedIn();
      const id = `${uid}_${stay.id}`;
      const ref = F.doc(db, 'threads', id);
      if (!(await F.getDoc(ref)).exists()) {
        const greeting = `Namaste! I'm ${hostName}, host of ${stay.name}. How can I help with your stay?`;
        await F.setDoc(ref, { uid, stayId: stay.id, stayName: stay.name, hostName, greeting, lastText: greeting, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
      }
      return id;
    }),
    watchMessages: (threadId, callback) => F.onSnapshot(
      F.query(F.collection(db, 'threads', threadId, 'messages'), F.orderBy('createdAt')),
      snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data({ serverTimestamps: 'estimate' }) }))),
      error => console.error(error)
    ),
    sendMessage: (threadId, text) => wrap(async () => {
      const { uid } = signedIn();
      await F.addDoc(F.collection(db, 'threads', threadId, 'messages'), { from: 'guest', uid, text, createdAt: F.serverTimestamp() });
      await F.updateDoc(F.doc(db, 'threads', threadId), { lastText: text, updatedAt: F.serverTimestamp() });
    }),
    listReviews: stayId => wrap(async () => {
      const snapshot = await F.getDocs(F.query(F.collection(db, 'reviews'), F.where('stayId', '==', stayId)));
      return snapshot.docs.map(item => item.data({ serverTimestamps: 'estimate' })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }),
    countMyReviews: () => wrap(async () => (await F.getDocs(F.query(F.collection(db, 'reviews'), F.where('uid', '==', signedIn().uid)))).size),
    addReview: (stayId, rating, text) => wrap(async () => {
      const { uid, name } = signedIn();
      await F.setDoc(F.doc(db, 'reviews', `${stayId}_${uid}`), { stayId, uid, name: name || 'Guest', rating, text, createdAt: F.serverTimestamp() });
    })
  };
}

/* ---------------------------------------------------------------- Demo mode */
function demoStore() {
  const KEY = 'hidden-stories:demo-db', SESSION = 'hidden-stories:demo-session';
  const blank = () => ({ users: {}, bookings: [], nights: {}, threads: {}, messages: {}, reviews: [] });
  const load = () => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return blank(); } };
  let db = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable: data lasts for this visit */ } };
  const listeners = new Set(), watchers = new Map();
  let pendingOtp = null;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* ignore */ } };
  const publicUser = record => record && { uid: record.uid, name: record.name, email: record.email || '', phone: record.phone || '', verified: true, provider: record.provider };
  let user = publicUser(db.users[read(SESSION)]);
  const emit = () => listeners.forEach(callback => callback(user));
  const signedIn = () => { if (!user) throw new FriendlyError('Please sign in first.'); return db.users[user.uid]; };
  const start = record => { write(SESSION, record.uid); user = publicUser(record); emit(); };
  const hash = async (email, password) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${email.toLowerCase()}::${password}`));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const newId = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const now = () => ({ seconds: Date.now() / 1000 });
  const notify = threadId => (watchers.get(threadId) || []).forEach(callback => callback([...(db.messages[threadId] || [])]));
  const later = value => new Promise(resolve => setTimeout(() => resolve(value), 220));

  return {
    mode: 'demo',
    get user() { return user; },
    onAuth(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    async signUpEmail({ name, email, password }) {
      email = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FriendlyError(authMessages['auth/invalid-email']);
      if (password.length < 8) throw new FriendlyError(authMessages['auth/weak-password']);
      if (Object.values(db.users).some(item => item.email === email)) throw new FriendlyError(authMessages['auth/email-already-in-use']);
      const record = { uid: newId('u'), name, email, phone: '', provider: 'password', passwordHash: await hash(email, password), wishlist: [], createdAt: now() };
      db.users[record.uid] = record; save(); start(record);
    },
    async signInEmail({ email, password }) {
      email = email.trim().toLowerCase();
      const record = Object.values(db.users).find(item => item.email === email);
      if (!record || record.passwordHash !== await hash(email, password)) throw new FriendlyError(authMessages['auth/invalid-credential']);
      start(record);
    },
    async resetPassword() { throw new FriendlyError('Password reset emails start working once Firebase is connected.'); },
    async signInGoogle() { throw new FriendlyError('Google sign-in starts working once Firebase is connected. In demo mode, use email or OTP.'); },
    async sendOtp(phone) {
      if (!/^\+\d{10,15}$/.test(phone)) throw new FriendlyError(authMessages['auth/invalid-phone-number']);
      pendingOtp = { phone, code: String(Math.floor(100000 + Math.random() * 900000)), expires: Date.now() + 5 * 60000 };
      return later({ demoCode: pendingOtp.code });
    },
    async verifyOtp(code) {
      if (!pendingOtp) throw new FriendlyError('Request a code first.');
      if (Date.now() > pendingOtp.expires) throw new FriendlyError(authMessages['auth/code-expired']);
      if (code !== pendingOtp.code) throw new FriendlyError(authMessages['auth/invalid-verification-code']);
      let record = Object.values(db.users).find(item => item.phone === pendingOtp.phone);
      if (!record) { record = { uid: newId('u'), name: '', email: '', phone: pendingOtp.phone, provider: 'phone', wishlist: [], createdAt: now() }; db.users[record.uid] = record; save(); }
      pendingOtp = null; start(record);
    },
    async signOut() { write(SESSION, null); user = null; emit(); },
    async profile() { return { ...signedIn() }; },
    async saveProfile({ name, phone }) { const record = signedIn(); Object.assign(record, { name, phone }); save(); user = publicUser(record); emit(); },
    async getWishlist() { return [...(signedIn().wishlist || [])]; },
    async setWish(stayId, saved) { const record = signedIn(); record.wishlist = saved ? [...new Set([...record.wishlist, stayId])] : record.wishlist.filter(id => id !== stayId); save(); },
    async mergeWishlist(ids) { const record = signedIn(); record.wishlist = [...new Set([...record.wishlist, ...ids])]; save(); },
    async listBookings() { const { uid } = signedIn(); return db.bookings.filter(item => item.uid === uid).sort((a, b) => b.createdAt.seconds - a.createdAt.seconds).map(item => ({ ...item })); },
    async createBooking(input) {
      const record = signedIn();
      const nights = nightsOf(input.checkIn, input.checkOut);
      if (nights.some(date => db.nights[`${input.stayId}_${date}`])) throw new FriendlyError('Some of these nights were just booked by someone else. Please choose different dates.');
      const booking = { ...input, id: newId('b'), uid: record.uid, nights: nights.length, ref: bookingCode(input.stayId), createdAt: now() };
      db.bookings.push(booking);
      nights.forEach(date => { db.nights[`${input.stayId}_${date}`] = { stayId: input.stayId, date, uid: record.uid, bookingId: booking.id }; });
      Object.assign(record, { name: record.name || input.guest.name, phone: record.phone || input.guest.phone });
      save(); return later({ ...booking });
    },
    async cancelBooking(id) {
      const { uid } = signedIn();
      const booking = db.bookings.find(item => item.id === id && item.uid === uid);
      if (!booking) throw new FriendlyError('That booking could not be found.');
      booking.status = 'cancelled'; booking.cancelledAt = now();
      nightsOf(booking.checkIn, booking.checkOut).forEach(date => delete db.nights[`${booking.stayId}_${date}`]);
      save();
    },
    async bookedNights(stayId) { return new Set(Object.values(db.nights).filter(item => item.stayId === stayId).map(item => item.date)); },
    async unavailableStays(dates) { const wanted = new Set(dates); return new Set(Object.values(db.nights).filter(item => wanted.has(item.date)).map(item => item.stayId)); },
    async listThreads() { const { uid } = signedIn(); return Object.values(db.threads).filter(item => item.uid === uid).sort((a, b) => b.updatedAt.seconds - a.updatedAt.seconds).map(item => ({ ...item })); },
    async openThread(stay, hostName) {
      const { uid } = signedIn();
      const id = `${uid}_${stay.id}`;
      if (!db.threads[id]) {
        const greeting = `Namaste! I'm ${hostName}, host of ${stay.name}. How can I help with your stay?`;
        db.threads[id] = { id, uid, stayId: stay.id, stayName: stay.name, hostName, greeting, lastText: greeting, createdAt: now(), updatedAt: now() };
        db.messages[id] = []; save();
      }
      return id;
    },
    watchMessages(threadId, callback) {
      const list = watchers.get(threadId) || [];
      watchers.set(threadId, [...list, callback]);
      callback([...(db.messages[threadId] || [])]);
      return () => watchers.set(threadId, (watchers.get(threadId) || []).filter(item => item !== callback));
    },
    async sendMessage(threadId, text) {
      const { uid } = signedIn();
      (db.messages[threadId] ||= []).push({ id: newId('m'), from: 'guest', uid, text, createdAt: now() });
      Object.assign(db.threads[threadId], { lastText: text, updatedAt: now() });
      save(); notify(threadId);
    },
    async listReviews(stayId) { return db.reviews.filter(item => item.stayId === stayId).sort((a, b) => b.createdAt.seconds - a.createdAt.seconds).map(item => ({ ...item })); },
    async countMyReviews() { const { uid } = signedIn(); return db.reviews.filter(item => item.uid === uid).length; },
    async addReview(stayId, rating, text) {
      const record = signedIn();
      db.reviews = db.reviews.filter(item => !(item.stayId === stayId && item.uid === record.uid));
      db.reviews.push({ stayId, uid: record.uid, name: record.name || 'Guest', rating, text, createdAt: now() });
      save();
    }
  };
}
