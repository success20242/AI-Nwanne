import { useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("Idle");
  const [checking, setChecking] = useState(false);

  const refreshStatus = async () => {
    setChecking(true);
    setStatus("Checking...");

    try {
      const res = await fetch(
        "/api/webhook?hub.mode=subscribe&hub.verify_token=success20242&hub.challenge=1234"
      );
      if (res.ok) {
        const text = await res.text();
        if (text === "1234") {
          setStatus("Webhook Verified ✅");
        } else {
          setStatus("Webhook response unexpected ⚠️");
        }
      } else if (res.status === 403) {
        setStatus("Forbidden: Invalid verify token ❌");
      } else {
        setStatus(`Error: ${res.status}`);
      }
    } catch (error) {
      setStatus("Network error or server down ❌");
    }

    setChecking(false);
  };

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        maxWidth: 600,
        margin: "3rem auto",
        backgroundColor: "#f9f9f9",
        borderRadius: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
        👋 Welcome to AI Nwanne
      </h1>

      <p style={{ fontSize: "1.25rem", marginBottom: "1.5rem" }}>
        This app is connected to the Meta Webhook successfully.
      </p>

      <p
        style={{
          fontWeight: "bold",
          color:
            status.includes("Verified") ? "green" : status.includes("Error") || status.includes("Forbidden") || status.includes("Network") ? "red" : "orange",
          marginBottom: "2rem",
          fontSize: "1.1rem",
          minHeight: "1.5rem",
        }}
      >
        Status: {status}
      </p>

      <button
        onClick={refreshStatus}
        disabled={checking}
        style={{
          padding: "0.75rem 2rem",
          fontSize: "1rem",
          borderRadius: 6,
          border: "none",
          backgroundColor: checking ? "#999" : "#0070f3",
          color: "white",
          cursor: checking ? "not-allowed" : "pointer",
          transition: "background-color 0.3s ease",
        }}
        onMouseEnter={(e) => {
          if (!checking) e.target.style.backgroundColor = "#005bb5";
        }}
        onMouseLeave={(e) => {
          if (!checking) e.target.style.backgroundColor = "#0070f3";
        }}
      >
        {checking ? "Checking..." : "Check Webhook Status"}
      </button>

      <footer
        style={{
          marginTop: "3rem",
          fontSize: "0.9rem",
          color: "#666",
        }}
      >
        © 2025 Onyekachi Ebosi —{" "}
        <a
          href="https://github.com/success20242/AI-Nwanne"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#0070f3", textDecoration: "none" }}
        >
          GitHub Repo
        </a>
      </footer>
    </main>
  );
}
