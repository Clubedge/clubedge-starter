// Verification and password reset emails that providers without their own (Better Auth, Firebase)
// send through the app's email provider. Plain functions
// returning text and HTML, so they are easy to read and change.

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends an auth email; the app passes its email provider's `send`. */
export type AuthEmailSender = (email: AuthEmail) => Promise<void>;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

function message({
  to,
  subject,
  intro,
  action,
  url,
  outro,
}: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): AuthEmail {
  const text = `${intro}\n\n${action}: ${url}\n\n${outro}\n`;
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p>`,
    `<p>Or open this link: ${escapeHtml(url)}</p>`,
    `<p>${escapeHtml(outro)}</p>`,
  ].join("\n");
  return { to, subject, text, html };
}

export function verificationEmail({
  to,
  url,
  appName,
}: {
  to: string;
  url: string;
  appName: string;
}) {
  return message({
    to,
    subject: `Confirm your email for ${appName}`,
    intro: `Confirm that ${to} is your email address to finish setting up your ${appName} account.`,
    action: "Confirm your email",
    url,
    outro: "If you did not create an account, you can ignore this email.",
  });
}

export function passwordResetEmail({
  to,
  url,
  appName,
}: {
  to: string;
  url: string;
  appName: string;
}) {
  return message({
    to,
    subject: `Reset your ${appName} password`,
    intro: `Someone asked to reset the password for ${to}. The link works once and expires in one hour.`,
    action: "Choose a new password",
    url,
    outro: "If you did not ask for this, you can ignore this email; your password stays the same.",
  });
}
