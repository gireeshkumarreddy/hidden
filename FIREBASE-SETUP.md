# Connecting Hidden Stories to Firebase

Until `firebase-config.js` has a config, the site runs in **demo mode**: accounts, bookings, messages and reviews live only in each visitor's own browser, and Google sign-in is switched off. These steps turn on real, shared accounts and data. Allow about 20 minutes.

## 1. Create the project

1. Go to <https://console.firebase.google.com> and choose **Add project**. Name it (for example `hidden-stories`). Google Analytics is optional.
2. In **Project settings → General → Your apps**, add a **Web app** (the `</>` icon). Hosting is not needed here.
3. Copy the `firebaseConfig` object it shows and paste it into `firebase-config.js`, replacing `null`:

   ```js
   export const firebaseConfig = {
     apiKey: '…',
     authDomain: 'hidden-stories.firebaseapp.com',
     projectId: 'hidden-stories',
     storageBucket: 'hidden-stories.appspot.com',
     messagingSenderId: '…',
     appId: '…'
   };
   ```

   These values are public by design. The security rules in step 4 are what protect the data.

## 2. Switch on sign-in methods

**Build → Authentication → Get started → Sign-in method**, then enable:

- **Email/Password**. Guests get a verification email after signing up, and "Forgot password?" sends a reset link.
- **Google**. Choose a support email. Before launch, open the OAuth consent screen in Google Cloud and add your app name, logo, privacy policy and terms URLs.
- **Phone**. For testing, add numbers under **Phone numbers for testing** (for example `+91 90000 00001` with code `123456`) so you don't spend real SMS. Real SMS is billed beyond Firebase's free allowance, so check current pricing.

Then go to **Authentication → Settings → Authorized domains** and add every address the site is served from, for example `hiddenstories.in`, `www.hiddenstories.in` or `yourname.github.io`. `localhost` is already listed.

## 3. Create the database

**Build → Firestore Database → Create database**, in **production mode**, region **asia-south1 (Mumbai)**.

## 4. Publish the security rules

Open **Firestore → Rules**, replace the contents with `firestore.rules` from this folder, and choose **Publish**. The rules make sure that:

- guests read and change only their own profile, wishlist, bookings and conversations;
- each booked night is a single document, so two guests can never book the same night;
- guests can cancel their own bookings, but only staff can confirm them or change prices;
- messages from guests can't pretend to come from the host;
- reviews are public, one per guest per stay, rated 1–5.

## 5. Try it

Serve the folder (`python3 -m http.server 8080`), then:

1. Create an account with email, sign in with Google, or use a test phone number.
2. Save a stay, book it, message the host and post a review.
3. In the Firestore console you'll see `users`, `bookings`, `nights`, `threads` (with `messages`) and `reviews`.

## Running the business day to day

There is no staff dashboard yet; for now you work from the Firestore console:

- **New bookings** appear in `bookings`. Instant-book stays arrive as `reserved` and the rest as `requested`. To confirm a request, change `status` to `reserved`, then contact the guest about payment. The site takes no payment online ("reserve now, pay later"), and `paymentPreference` shows whether they chose UPI, card or bank transfer.
- **Prices are worked out in the browser**, so check the total against your rate card before collecting payment.
- **Replying to a guest**: open `threads/<id>/messages`, add a document `{ from: "host", text: "…", createdAt: <timestamp> }`, and it appears in the guest's inbox straight away.
- **Cancellations** set `status` to `cancelled` and free the nights automatically.

## Google Maps price pins (optional)

Out of the box, Explore → Map shows Google Maps for the neighbourhood of whichever stay is chosen; no key is needed. To show every matching stay as a price pin on one interactive map:

1. In Google Cloud (you can use the same project Firebase created), open **APIs & Services → Library** and enable **Maps JavaScript API**. Billing must be on, and Google's monthly free usage covers a small site.
2. Under **Credentials → Create credentials → API key**, restrict the key to **Websites** (your domains plus `localhost`) and to the **Maps JavaScript API**.
3. Optionally, under **Google Maps Platform → Map management**, create a **Map ID** (type JavaScript, vector).
4. Put both in `maps-config.js`: `apiKey: '…', mapId: '…'`.

If the key is wrong or not yet allowed for an address, the site switches back to the embedded map by itself.

## Worth adding before a big launch

- A staff dashboard for confirming bookings and replying to messages.
- A Cloud Function that re-checks prices and sends confirmation emails or WhatsApp messages.
- Online payments through Razorpay, which needs a small server function to create and verify orders.
- Privacy policy and terms pages, which Google sign-in's consent screen requires.
