# Privacy Policy for CodeAway

**Effective Date:** September 12, 2026  
**Last Updated:** September 12, 2026

CodeAway ("we," "our," or "us") provides a developer productivity platform enabling users to monitor, manage, and execute automated software engineering tasks on their local computers via a mobile application.

This Privacy Policy describes how CodeAway collects, uses, and discloses information when you use our mobile application, backend services, and CLI agent software (collectively, the "Services").

---

## 1. Information We Collect

### A. Information You Provide
- **Account Information:** When you register for an account, we collect your email address and an encrypted hash of your password.
- **AI Provider Credentials:** If you configure custom AI API keys (e.g., Google Gemini, Anthropic Claude, OpenAI), these credentials remain stored locally on your own computer daemon or in encrypted form strictly to communicate with the corresponding AI model API on your behalf.
- **Tasks and Prompts:** Instructions, code queries, and commands you submit via the mobile app to run in your connected workspaces.

### B. Automatically Collected Technical Data
- **Device Identifiers:** Device name, hostname, and operating system platform (e.g., macOS, Linux, Android) to allow your mobile app to recognize and pair with your authorized development workstations.
- **Operational Logs:** Status updates, command execution summaries, test outputs, and diagnostic logs generated during task runs.
- **Network Metadata:** IP addresses and timestamps necessary for establishing secure WebSocket and HTTPS connections between your mobile client, backend relay, and local agent daemon.

---

## 2. How We Use Your Information

We use the collected information solely to:
- Authenticate your identity and secure access to your development workstations.
- Relay task instructions from your mobile app to your connected agent daemon.
- Deliver real-time status updates, file modification summaries, and terminal outputs to your mobile device.
- Maintain and improve the security, stability, and performance of the Services.

**We DO NOT:**
- Sell, rent, or monetize your personal data or codebase.
- Use your proprietary code to train public machine learning models.
- Track your activity across third-party apps or websites for targeted advertising.
- Display third-party advertisements in CodeAway.

---

## 3. Data Storage and Security

- **Encryption in Transit:** All communication between the mobile app, backend servers, and local agent daemons is transmitted over encrypted protocols (TLS/HTTPS and WSS).
- **Password Protection:** User passwords are encrypted using industry-standard bcrypt cryptographic hashing before persistence in our database.
- **Local Execution Sandbox:** Code execution, file reading, and editing happen locally on your own development computer within an isolated workspace jail. Files outside your designated workspace cannot be accessed or transmitted.

---

## 4. Third-Party Services and AI Models

CodeAway integrates with third-party Artificial Intelligence providers selected by you:
- **Google Gemini** (Google LLC)
- **Anthropic Claude** (Anthropic PBC)
- **OpenAI** (OpenAI, Inc.)

When you run a coding task, your task prompt and relevant workspace file context are sent directly to the selected AI provider to generate diffs and code suggestions. Use of these third-party APIs is governed by their respective privacy policies and terms of service.

---

## 5. Data Retention and Account Deletion

We retain account data and task logs only for as long as your account remains active. You may request the deletion of your account, connected devices, and associated task history at any time by contacting our support team or deleting your account directly within the app settings. Upon deletion, all associated data is permanently purged from our active databases.

---

## 6. Children's Privacy

Our Services are intended for professional software developers and general technology users aged 13 and above (or 16 in certain jurisdictions). We do not knowingly collect personal data from children under 13.

---

## 7. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect improvements in our platform or legal requirements. Any modifications will be posted with an updated "Effective Date".

---

## 8. Contact Us

If you have questions or concerns regarding this Privacy Policy or our data practices, please contact us at:
- **Email:** support@codeaway.dev
- **GitHub Repository:** https://github.com/JaoharRaihan/CodeAway
