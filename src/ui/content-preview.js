/**
 * Content Preview — auto-detects string content types and provides inline visual hints.
 * Inspired by JSON Hero's content preview system.
 */
window.App = window.App || {};
window.App.contentPreview = (() => {
  const { esc } = window.App.dom;
  const { formatSize, relativeTime } = window.App.primitives;

  // Detection patterns
  const COLOR_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const COLOR_RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/i;
  const COLOR_HSL = /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?/i;
  const IMAGE_URL = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)(\?[^"]*)?$/i;
  const URL_PATTERN = /^https?:\/\/[^\s"]+$/i;
  const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
  const JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const BASE64_PATTERN = /^[A-Za-z0-9+/]{20,}={0,2}$/;
  const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
  const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  const PHONE_PATTERN = /^[+]?[\d\s\-().]{7,18}$/;
  const COUNTRY_CODE = /^[A-Z]{2}$/;
  const CURRENCY_PATTERN = /^[£$€¥₹₽₩][\d,.]+$|^[\d,.]+\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|CNY)$/i;
  const FILE_PATH = /^([a-zA-Z]:\\|\/)([\w\-.]+[/\\])*[\w\-. ]+(\.\w+)?$/;
  const COORDS_PATTERN = /^-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}$/;
  const CRON_PATTERN = /^(\*(?:\/\d+)?|[\d,\-/]+)\s+(\*(?:\/\d+)?|[\d,\-/]+)\s+(\*(?:\/\d+)?|[\d,\-/]+)\s+(\*(?:\/\d+)?|[\d,\-/]+)\s+(\*(?:\/\d+)?|[\d,\-/]+)(\s+(\*(?:\/\d+)?|[\d,\-/]+))?$/;
  const HTML_PATTERN = /^<[a-zA-Z][^>]*>/;
  const MD_PATTERN = /^#{1,6}\s|^\*{1,2}[^*]+\*{1,2}|^\[.+\]\(.+\)/;

  // Country code → flag emoji + name (common subset)
  const COUNTRIES = {US:'United States',GB:'United Kingdom',DE:'Germany',FR:'France',JP:'Japan',CN:'China',IN:'India',BR:'Brazil',CA:'Canada',AU:'Australia',IT:'Italy',ES:'Spain',KR:'South Korea',MX:'Mexico',RU:'Russia',NL:'Netherlands',SE:'Sweden',CH:'Switzerland',NO:'Norway',DK:'Denmark',FI:'Finland',PL:'Poland',PT:'Portugal',AT:'Austria',BE:'Belgium',IE:'Ireland',NZ:'New Zealand',SG:'Singapore',HK:'Hong Kong',IL:'Israel',ZA:'South Africa',AE:'United Arab Emirates',SA:'Saudi Arabia',TW:'Taiwan',TH:'Thailand',TR:'Türkiye',UA:'Ukraine',VN:'Vietnam',PH:'Philippines',MY:'Malaysia',ID:'Indonesia',AR:'Argentina',CL:'Chile',CO:'Colombia',EG:'Egypt',NG:'Nigeria',KE:'Kenya',GH:'Ghana'};

  function countryFlag(code) {
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  }

  // HTTP status code meanings
  const HTTP_CODES = {200:'OK',201:'Created',204:'No Content',301:'Moved Permanently',302:'Found',304:'Not Modified',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',408:'Timeout',409:'Conflict',429:'Too Many Requests',500:'Internal Server Error',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'};

  // Common ports
  const PORTS = {21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',53:'DNS',80:'HTTP',110:'POP3',143:'IMAP',443:'HTTPS',993:'IMAPS',995:'POP3S',1433:'MSSQL',3000:'Dev',3306:'MySQL',3389:'RDP',5432:'PostgreSQL',5672:'RabbitMQ',6379:'Redis',8080:'HTTP-Alt',8443:'HTTPS-Alt',9090:'Prometheus',9200:'Elasticsearch',27017:'MongoDB'};

  /**
   * Generate preview chip HTML for a string value.
   * Returns empty string if no special content detected.
   */
  function getChip(val) {
    if (typeof val === 'number') return getNumChip(val);
    if (typeof val !== 'string' || val.length === 0 || val.length > 2048) return '';

    // Color detection
    if (COLOR_HEX.test(val)) {
      return `<span class="cp-chip cp-color" data-color="${esc(val)}" style="background:${val}" title="Color: ${val}. Click to copy."></span>`;
    }
    if (COLOR_RGB.test(val) || COLOR_HSL.test(val)) {
      return `<span class="cp-chip cp-color" data-color="${esc(val)}" style="background:${val}" title="Color: ${val}. Click to copy."></span>`;
    }

    // Image URL
    if (IMAGE_URL.test(val) && URL_PATTERN.test(val)) {
      return `<span class="cp-chip cp-img" data-url="${esc(val)}" title="Image: hover to preview">&#128444;</span>`;
    }

    // Regular URL
    if (URL_PATTERN.test(val)) {
      let favicon = '';
      try {
        const u = new URL(val);
        favicon = `<img class="cp-favicon" src="https://www.google.com/s2/favicons?domain=${u.hostname}&sz=16" alt="" onerror="this.style.display='none'">`;
      } catch { /* ignore */ }
      return `<a class="cp-chip cp-url" href="${esc(val)}" target="_blank" rel="noopener" title="${esc(val)}">${favicon}&#128279;</a>`;
    }

    // JWT
    if (JWT_PATTERN.test(val)) {
      return `<span class="cp-chip cp-jwt" data-jwt="${esc(val)}" title="Security token (click to decode)">JWT</span>`;
    }

    // Email
    if (EMAIL_PATTERN.test(val)) {
      return `<a class="cp-chip cp-email" href="mailto:${esc(val)}" title="Email: ${esc(val)}">&#9993;</a>`;
    }

    // UUID / GUID
    if (UUID_PATTERN.test(val)) {
      const ver = val[14];
      const isStrictUuid = /[1-5]/.test(ver) && /[89ab]/i.test(val[19]);
      const label = isStrictUuid ? 'UUID' : 'GUID';
      const title = isStrictUuid ? `Unique ID (version ${ver})` : 'Unique ID';
      return `<span class="cp-chip cp-uuid" title="${title}">${label}</span>`;
    }

    // ISO Date
    if (ISO_DATE.test(val)) {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const ago = relativeTime(d);
          return `<span class="cp-chip cp-date" title="${d.toLocaleString()}">${ago}</span>`;
        }
      } catch { /* ignore */ }
    }

    // IP address (check before phone — IPs can match phone pattern)
    if (IP_PATTERN.test(val)) {
      const isPrivate = val.startsWith('192.168.') || val.startsWith('10.') || val.startsWith('172.') || val === '127.0.0.1';
      return `<span class="cp-chip cp-ip" title="IP Address${isPrivate ? ' (private)' : ''}">${isPrivate ? '🏠' : '🌐'}IP</span>`;
    }

    // Cron expression
    if (CRON_PATTERN.test(val)) {
      return `<span class="cp-chip cp-cron" title="Scheduled task pattern">⏲ cron</span>`;
    }

    // Phone number (must have + or separators like - or (), not just digits/dots)
    if (PHONE_PATTERN.test(val) && /[+\-() ]/.test(val) && val.replace(/[^\d]/g, '').length >= 7) {
      return `<a class="cp-chip cp-phone" href="tel:${esc(val.replace(/[^\d+]/g, ''))}" title="Phone number">&#128222;</a>`;
    }

    // Semantic version
    if (SEMVER_PATTERN.test(val)) {
      return `<span class="cp-chip cp-ver" title="Version number">v</span>`;
    }

    // Country code
    if (COUNTRY_CODE.test(val) && COUNTRIES[val]) {
      return `<span class="cp-chip cp-country" title="${COUNTRIES[val]}">${countryFlag(val)}</span>`;
    }

    // Currency
    if (CURRENCY_PATTERN.test(val)) {
      return `<span class="cp-chip cp-currency" title="Currency value">💰</span>`;
    }

    // Coordinates (lat,lng)
    if (COORDS_PATTERN.test(val)) {
      const [lat, lng] = val.split(',').map(s => s.trim());
      return `<a class="cp-chip cp-coords" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}" target="_blank" rel="noopener" title="Coordinates: ${lat}, ${lng}">📍</a>`;
    }

    // File path
    if (FILE_PATH.test(val)) {
      const ext = val.split('.').pop().toLowerCase();
      const icon = {js:'📜',ts:'📜',py:'🐍',json:'📋',xml:'📄',html:'🌐',css:'🎨',md:'📝',txt:'📃',log:'📃',csv:'📊',sql:'🗄',yml:'⚙',yaml:'⚙',sh:'⚡',bat:'⚡',exe:'⚙',dll:'⚙',zip:'📦',tar:'📦',gz:'📦',png:'🖼',jpg:'🖼',svg:'🖼',pdf:'📕'}[ext] || '📁';
      return `<span class="cp-chip cp-path" title="File path">${icon}</span>`;
    }

    // HTML content
    if (HTML_PATTERN.test(val)) {
      return `<span class="cp-chip cp-html" title="Contains HTML markup">&lt;/&gt;</span>`;
    }

    // Markdown
    if (MD_PATTERN.test(val)) {
      return `<span class="cp-chip cp-md" title="Formatted text (Markdown)">MD</span>`;
    }

    // Base64 (check last - broad pattern)
    if (val.length > 30 && BASE64_PATTERN.test(val)) {
      return `<span class="cp-chip cp-b64" data-b64="${esc(val)}" title="Encoded text. Click to decode.">B64</span>`;
    }

    return '';
  }

  /**
   * Generate preview chip for number values.
   */
  function getNumChip(val) {
    if (typeof val !== 'number' || !isFinite(val)) return '';

    // Unix timestamp (seconds: 10 digits, ms: 13 digits)
    if (Number.isInteger(val)) {
      const str = String(val);
      if (str.length === 10 && val > 946684800 && val < 4102444800) {
        const d = new Date(val * 1000);
        return `<span class="cp-chip cp-ts" title="${d.toLocaleString()}">${relativeTime(d)}</span>`;
      }
      if (str.length === 13 && val > 946684800000 && val < 4102444800000) {
        const d = new Date(val);
        return `<span class="cp-chip cp-ts" title="${d.toLocaleString()}">${relativeTime(d)}</span>`;
      }

      // HTTP status code
      if (HTTP_CODES[val]) {
        const color = val < 300 ? '#16a34a' : val < 400 ? '#2563eb' : val < 500 ? '#ea580c' : '#dc2626';
        return `<span class="cp-chip cp-http" style="background:${color}" title="HTTP ${val} ${HTTP_CODES[val]}">${HTTP_CODES[val]}</span>`;
      }

      // Port number
      if (PORTS[val]) {
        return `<span class="cp-chip cp-port" title="Port ${val}: ${PORTS[val]}">${PORTS[val]}</span>`;
      }

      // File size (heuristic: check if looks like bytes — large integers)
      if (val >= 1024 && val <= 1099511627776) {
        return `<span class="cp-chip cp-size" title="${val.toLocaleString()} bytes">${formatSize(val)}</span>`;
      }
    }

    return '';
  }

  /**
   * Decode JWT token and return formatted HTML
   */
  function decodeJWT(token) {
    try {
      const parts = token.split('.');
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { header, payload };
    } catch { return null; }
  }

  /**
   * Setup hover/click handlers for preview chips (delegated on container)
   */
  function setupHandlers(container) {
    // Image hover preview
    let tooltip = null;
    container.addEventListener('mouseenter', e => {
      const chip = e.target.closest('.cp-img');
      if (!chip) return;
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'cp-tooltip';
        document.body.appendChild(tooltip);
      }
      const url = chip.dataset.url;
      tooltip.innerHTML = `<img src="${esc(url)}" alt="preview" onerror="this.parentElement.innerHTML='Failed to load'">`;
      const rect = chip.getBoundingClientRect();
      tooltip.style.top = (rect.bottom + 6) + 'px';
      tooltip.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
      tooltip.classList.add('show');
    }, true);

    container.addEventListener('mouseleave', e => {
      if (e.target.closest('.cp-img') && tooltip) {
        tooltip.classList.remove('show');
      }
    }, true);

    // Click handlers (delegated)
    container.addEventListener('click', e => {
      // JWT click decoder
      const jwtChip = e.target.closest('.cp-jwt');
      if (jwtChip) {
        const decoded = decodeJWT(jwtChip.dataset.jwt);
        if (!decoded) return;
        const html = `<div class="cp-jwt-popup">
          <div class="cp-jwt-section"><strong>Header:</strong><pre>${esc(JSON.stringify(decoded.header, null, 2))}</pre></div>
          <div class="cp-jwt-section"><strong>Payload:</strong><pre>${esc(JSON.stringify(decoded.payload, null, 2))}</pre></div>
        </div>`;
        let popup = document.querySelector('.cp-jwt-popup');
        if (popup) popup.remove();
        jwtChip.insertAdjacentHTML('afterend', html);
        setTimeout(() => { const p = document.querySelector('.cp-jwt-popup'); if (p) p.remove(); }, 8000);
        return;
      }

      // Color click → copy
      const colorChip = e.target.closest('.cp-color');
      if (colorChip && colorChip.dataset.color) {
        navigator.clipboard.writeText(colorChip.dataset.color);
        window.App.dom.toast('Color copied: ' + colorChip.dataset.color);
        return;
      }

      // Base64 click → decode
      const b64Chip = e.target.closest('.cp-b64');
      if (b64Chip && b64Chip.dataset.b64) {
        try {
          const decoded = atob(b64Chip.dataset.b64);
          let popup = document.querySelector('.cp-b64-popup');
          if (popup) popup.remove();
          // Check if decoded is JSON
          let display;
          try {
            const obj = JSON.parse(decoded);
            display = JSON.stringify(obj, null, 2);
          } catch {
            display = decoded.length > 500 ? decoded.substring(0, 500) + '...' : decoded;
          }
          const html = `<div class="cp-b64-popup"><strong>Decoded Base64:</strong><pre>${esc(display)}</pre></div>`;
          b64Chip.insertAdjacentHTML('afterend', html);
          setTimeout(() => { const p = document.querySelector('.cp-b64-popup'); if (p) p.remove(); }, 8000);
        } catch { /* invalid base64 */ }
        return;
      }
    });
  }

  return { getChip, decodeJWT, setupHandlers };
})();
