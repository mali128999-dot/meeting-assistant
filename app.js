const WORKER_URL = "https://meeting-assistant.jawad-safdar226.workers.dev";

(function () {
  "use strict";

  // Monthly prices in USD per region tier (see SPEC: Pricing regions).
  const PRICES = { tier1: 5, tier2: 10, tier3: 15 };

  const TIER1 = new Set([
    "IN", "PK", "BD", "LK", "NP", "EG", "NG", "KE", "GH", "ET", "TZ", "UG",
    "PH", "ID", "VN", "TH", "MY", "MM", "KH", "LA",
    // Other African countries
    "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG",
    "CD", "CI", "DJ", "GQ", "ER", "SZ", "GA", "GM", "GN", "GW", "LS", "LR",
    "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "RW", "SN",
    "SL", "SO", "ZA", "SS", "SD", "TG", "TN", "ZM", "ZW", "ST", "SC"
  ]);

  const TIER2 = new Set([
    "MX", "BR", "AR", "CO", "CL", "PE", "VE", "EC", "BO", "PY", "UY", "CR",
    "PA", "GT", "HN", "SV", "NI", "DO", "CU",
    "PL", "RO", "BG", "HU", "CZ", "SK", "RS", "HR", "BA", "AL", "MK", "UA",
    "BY", "MD", "TR"
  ]);

  // Used only when navigator.language has no region (e.g. "en" or "ar").
  const TZ_COUNTRY = {
    "Asia/Karachi": "PK", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
    "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP",
    "Asia/Manila": "PH", "Asia/Jakarta": "ID", "Asia/Ho_Chi_Minh": "VN",
    "Asia/Bangkok": "TH", "Asia/Kuala_Lumpur": "MY", "Asia/Riyadh": "SA",
    "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
    "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Asia/Istanbul": "TR",
    "Europe/Istanbul": "TR", "Europe/Warsaw": "PL", "Europe/Bucharest": "RO",
    "Europe/Sofia": "BG", "Europe/Budapest": "HU", "Europe/Prague": "CZ",
    "Europe/Bratislava": "SK", "Europe/Belgrade": "RS", "Europe/Zagreb": "HR",
    "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Europe/London": "GB",
    "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Madrid": "ES",
    "Europe/Rome": "IT", "America/New_York": "US", "America/Chicago": "US",
    "America/Denver": "US", "America/Los_Angeles": "US",
    "America/Toronto": "CA", "America/Mexico_City": "MX",
    "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR",
    "America/Bogota": "CO", "America/Santiago": "CL", "America/Lima": "PE",
    "Australia/Sydney": "AU", "Australia/Melbourne": "AU"
  };

  function guessCountry() {
    // 1. Region subtag of the browser language, e.g. "en-SA" -> "SA".
    const lang = navigator.language || "";
    const match = lang.match(/-([A-Za-z]{2})(?=-|$)/);
    if (match) return match[1].toUpperCase();

    // 2. Timezone fallback.
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {
      tz = "";
    }
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    return "";
  }

  function tierFor(country, tz) {
    if (country) {
      if (TIER1.has(country)) return "tier1";
      if (TIER2.has(country)) return "tier2";
      return "tier3";
    }
    // No country code at all: any African timezone is tier1.
    if (tz && tz.indexOf("Africa/") === 0) return "tier1";
    return "tier3";
  }

  function getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {
      return "";
    }
  }

  function setupPricing(country) {
    const tz = getTimezone();
    const tier = tierFor(country, tz);
    const amountEl = document.getElementById("price-amount");
    const noteEl = document.getElementById("price-note");
    if (amountEl) amountEl.textContent = "$" + PRICES[tier];
    if (noteEl) {
      noteEl.textContent = country
        ? "Your price, based on your location (" + country + ")."
        : "Estimated from your location. Your final price is confirmed in the form.";
    }
  }

  function isApplePlatform() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua) ||
           /Mac|iPhone|iPad|iPod/i.test(platform);
  }

  function setupDownload() {
    if (!isApplePlatform()) return;
    const btn = document.getElementById("download-btn");
    const macBox = document.getElementById("mac-box");
    if (btn) btn.hidden = true;
    if (macBox) macBox.hidden = false;
  }

  // ---- Forms ----

  const FIELDS = ["name", "email", "country", "company", "phone", "message"];

  const SUCCESS_MESSAGES = {
    upgrade: "Thanks! We'll email you payment details and your license key.",
    mac: "Thanks! We'll get back to you by email soon.",
    contact: "Thanks! We'll get back to you by email soon.",
    extended: "Thanks! We'll get back to you by email soon."
  };

  function setStatus(form, message, kind) {
    const status = form.querySelector(".form-status");
    if (!status) return;
    status.textContent = message;
    status.className = "form-status" + (kind ? " " + kind : "");
  }

  async function errorMessageFor(response) {
    if (response.status === 429) {
      return "Too many requests today. Please try again tomorrow.";
    }
    if (response.status === 400) {
      return "Please check the form and try again.";
    }
    return "Something went wrong. Please try again later.";
  }

  function buildPayload(form) {
    const data = new FormData(form);
    const payload = { type: form.dataset.formType };
    FIELDS.forEach(function (key) {
      payload[key] = String(data.get(key) || "").trim();
    });
    payload.consent = data.get("consent") === "on";
    return payload;
  }

  function handleSubmit(form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (WORKER_URL.indexOf("CHANGE_ME") !== -1) {
        setStatus(form, "This form is not connected yet. Please try again later.", "error");
        return;
      }

      const payload = buildPayload(form);
      if (button) button.disabled = true;
      setStatus(form, "Sending...", "info");

      try {
        const response = await fetch(WORKER_URL + "/v1/form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          setStatus(form, SUCCESS_MESSAGES[payload.type] || "Thanks! We'll be in touch.", "success");
          form.reset();
        } else {
          setStatus(form, await errorMessageFor(response), "error");
        }
      } catch (err) {
        setStatus(form, "Could not reach the server. Check your connection and try again.", "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  function prefillCountry(country) {
    if (!country) return;
    ["up-country", "mac-country"].forEach(function (id) {
      const input = document.getElementById(id);
      if (input && !input.value) input.value = country;
    });
  }

  // ---- Init ----

  document.addEventListener("DOMContentLoaded", function () {
    const country = guessCountry();
    setupPricing(country);
    setupDownload();
    prefillCountry(country);
    document.querySelectorAll("form[data-form-type]").forEach(handleSubmit);
  });
})();
