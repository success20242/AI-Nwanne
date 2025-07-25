// pages/data-deletion.js

import Head from "next/head";

export default function DataDeletion() {
  return (
    <>
      <Head>
        <title>Data Deletion Instructions - AI Nwanne</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <main style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
        <h1>Data Deletion Instructions</h1>
        <p>We respect your privacy and allow you to delete your data at any time.</p>

        <h2>How to Request Data Deletion</h2>
        <p>To delete your data associated with the AI Nwanne app:</p>
        <ol>
          <li>
            Email us at{" "}
            <a href="mailto:kachiboy4life@yahoo.com">kachiboy4life@yahoo.com</a> with the subject “Data Deletion Request.”
          </li>
          <li>Include your Facebook profile name or ID used to sign in.</li>
          <li>We will confirm and process your request within 7 business days.</li>
        </ol>

        <p>If you have further questions, feel free to contact us directly.</p>
      </main>
    </>
  );
}
