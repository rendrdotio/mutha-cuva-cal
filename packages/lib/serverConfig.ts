import type SendmailTransport from "nodemailer/lib/sendmail-transport";
import type SMTPConnection from "nodemailer/lib/smtp-connection";

import { isENVDev } from "@calcom/lib/env";

import { getAdditionalEmailHeaders } from "./getAdditionalEmailHeaders";

// Custom Resend API transport
class ResendApiTransport {
  apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log(
      "[EMAIL] ResendApiTransport initialized with API key:",
      apiKey ? `${apiKey.substring(0, 10)}...` : "NOT SET"
    );
  }

  async send(mail: any, callback: (error: any, info: any) => void) {
    console.log("[EMAIL] Attempting to send email via Resend API");
    // Don't try to log the full mail object - it has circular references
    console.log("[EMAIL] Mail object received, checking for email data...");

    try {
      // Nodemailer processes the mail object and may store data in different properties
      // Let's check all possible locations where the email data might be stored
      console.log("[EMAIL] Mail object keys:", Object.keys(mail));
      console.log("[EMAIL] Mail.data keys:", mail.data ? Object.keys(mail.data) : "mail.data is undefined");
      console.log(
        "[EMAIL] Mail.message keys:",
        mail.message ? Object.keys(mail.message) : "mail.message is undefined"
      );

      // Try to extract email data from various possible locations
      // First check if we have the original data passed from the email flow
      const originalData = mail.originalEmailData;
      const emailData = originalData || mail.data || mail.message || mail;

      const requestBody = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      };

      console.log("[EMAIL] Request body prepared:", {
        from: requestBody.from,
        to: requestBody.to,
        subject: requestBody.subject,
        hasHtml: !!requestBody.html,
        hasText: !!requestBody.text,
      });

      console.log("[EMAIL] Making request to Resend API...");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("[EMAIL] Resend API response status:", response.status);
      console.log("[EMAIL] Resend API response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[EMAIL] Resend API error response:", errorText);
        callback(new Error(`Resend API error: ${errorText}`), null);
        return;
      }

      const result = await response.json();
      console.log("[EMAIL] Resend API success response:", result);
      callback(null, { messageId: result.id });
    } catch (error) {
      console.error("[EMAIL] Exception during Resend API call:", error);
      callback(error, null);
    }
  }

  verify(callback: (error: any, success: boolean) => void) {
    console.log("[EMAIL] Verifying Resend API key...");
    // Test the API key
    fetch("https://api.resend.com/domains", {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })
      .then((response) => {
        console.log("[EMAIL] API key verification response status:", response.status);
        if (response.ok) {
          console.log("[EMAIL] API key verification successful");
          callback(null, true);
        } else {
          console.error("[EMAIL] API key verification failed");
          callback(new Error("Invalid API key"), false);
        }
      })
      .catch((error) => {
        console.error("[EMAIL] API key verification exception:", error);
        callback(error, false);
      });
  }
}

function detectTransport():
  | SendmailTransport.Options
  | SMTPConnection.Options
  | string
  | ResendApiTransport
  | any {
  console.log("[EMAIL] Detecting email transport...");
  console.log("[EMAIL] RESEND_API_KEY present:", !!process.env.RESEND_API_KEY);
  console.log("[EMAIL] EMAIL_SERVER_HOST:", process.env.EMAIL_SERVER_HOST);
  console.log("[EMAIL] EMAIL_SERVER_PORT:", process.env.EMAIL_SERVER_PORT);

  if (process.env.RESEND_API_KEY) {
    console.log("[EMAIL] Using Resend API transport");
    // Use Resend API instead of SMTP
    return new ResendApiTransport(process.env.RESEND_API_KEY);
  }

  if (process.env.EMAIL_SERVER) {
    console.log("[EMAIL] Using EMAIL_SERVER transport");
    return process.env.EMAIL_SERVER;
  }

  if (process.env.EMAIL_SERVER_HOST) {
    console.log("[EMAIL] Using SMTP transport");
    const port = parseInt(process.env.EMAIL_SERVER_PORT || "");
    const auth =
      process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD
        ? {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD,
          }
        : undefined;

    const transport = {
      host: process.env.EMAIL_SERVER_HOST,
      port,
      auth,
      secure: port === 465,
      tls: {
        rejectUnauthorized: !isENVDev,
      },
    };

    return transport;
  }

  console.log("[EMAIL] Using sendmail transport");
  return {
    sendmail: true,
    newline: "unix",
    path: "/usr/sbin/sendmail",
  };
}

export const serverConfig = {
  transport: detectTransport(),
  from: process.env.EMAIL_FROM,
  headers: getAdditionalEmailHeaders(),
};
