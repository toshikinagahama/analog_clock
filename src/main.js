const { getCurrentWindow } = window.__TAURI__.window;
const { mkdir, readTextFile, writeTextFile, exists, BaseDirectory } = window.__TAURI__.fs;
const { join } = window.__TAURI__.path;

const appWindow = getCurrentWindow();

// --- Configuration ---
const CONFIG_DIR = 'hama/hama_clock';
const CONFIG_FILE = 'config.json';
const DEFAULT_CONFIG = {
  clockSize: 280,
  fontSize: 16,
  slots: [
    { code: 'TYO', tz: 'Asia/Tokyo' },
    { code: 'NYC', tz: 'America/New_York' },
    { code: 'LON', tz: 'Europe/London' }
  ],
  activeSlot: 0
};

let config = { ...DEFAULT_CONFIG };

// --- DOM Elements ---
const hourHand = document.getElementById('hour-hand');
const minuteHand = document.getElementById('minute-hand');
const secondHand = document.getElementById('second-hand');
const amPmEl = document.getElementById('am-pm');

// --- Initialization ---
async function init() {
    await loadConfig();
    generateMarkers();
    setupInteractions();
    
    // Start Clock
    updateClock();
    setInterval(updateClock, 500);
}

function generateMarkers() {
    const face = document.querySelector('.face');
    // Clear existing markers if any (except hands/center)
    document.querySelectorAll('.marker').forEach(e => e.remove());
    
    for (let i = 0; i < 12; i++) {
      const marker = document.createElement('div');
      marker.classList.add('marker');
      if (i % 3 === 0) {
          marker.classList.add('hour');
      }
      marker.style.transform = `translateX(-50%) rotate(${i * 30}deg)`;
      face.appendChild(marker);
    }
}

function setupInteractions() {
    // Window Dragging
    document.getElementById('clock-el')?.addEventListener('mousedown', (e) => {
        if (e.buttons === 1) {
            e.detail === 2
            ? appWindow.toggleMaximize()
            : appWindow.startDragging();
        }
    });

    // Close modal on outside click
    document.getElementById('city-modal').addEventListener('click', (e) => {
        if (e.target.id === 'city-modal') {
            e.target.classList.remove('open');
        }
    });
}

// --- Configuration Logic ---
async function loadConfig() {
    try {
        const configPath = await join(CONFIG_DIR, CONFIG_FILE);
        const fileExists = await exists(configPath, { baseDir: BaseDirectory.Home });
        
        if (!fileExists) {
             console.log('Creating new config at', configPath);
            await mkdir(CONFIG_DIR, { baseDir: BaseDirectory.Home, recursive: true });
            await saveConfig(DEFAULT_CONFIG);
            config = { ...DEFAULT_CONFIG };
        } else {
             console.log('Loading config from', configPath);
            const content = await readTextFile(configPath, { baseDir: BaseDirectory.Home });
            config = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
        }
        applyConfig();
    } catch (e) {
        console.error('Failed to load config', e);
        // Fallback to default config if loading fails
        applyConfig();
    }
}

async function saveConfig(newConfig) {
    try {
        const configPath = await join(CONFIG_DIR, CONFIG_FILE);
        await writeTextFile(configPath, JSON.stringify(newConfig, null, 2), { baseDir: BaseDirectory.Home });
        config = newConfig;
    } catch (e) {
        console.error('Failed to save config, trying to recreate dir...', e);
        try {
            await mkdir(CONFIG_DIR, { baseDir: BaseDirectory.Home, recursive: true });
            const configPath = await join(CONFIG_DIR, CONFIG_FILE);
            await writeTextFile(configPath, JSON.stringify(newConfig, null, 2), { baseDir: BaseDirectory.Home });
            config = newConfig;
            console.log('Config saved successfully after mkdir');
        } catch (e2) {
            console.error('Retry save failed', e2);
        }
    }
}

function applyConfig() {
    // 1. Resize Clock
    // Handled by CSS (vmin) responding to window size
    
    // 2. Font Size
    // Apply to root for em/rem scaling, or directly to elements
    // The user asked for "font size config", let's apply to body or specific elements
    document.documentElement.style.fontSize = `${config.fontSize}px`;
    
    // 3. Render Buttons
    const buttonsContainer = document.getElementById('city-buttons');
    buttonsContainer.innerHTML = '';
    
    // Ensure slots structure
    const slots = config.slots || DEFAULT_CONFIG.slots;
    
    slots.forEach((slot, index) => {
        const btn = document.createElement('button');
        btn.className = `city-btn ${index === (config.activeSlot || 0) ? 'active' : ''}`;
        btn.textContent = slot.code;
        
        // Left Click: Switch active slot
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                config.activeSlot = index;
                // Update UI immediately (optimistic)
                applyConfig(); 
                updateClock();
                // Then try to save
                await saveConfig(config);
            } catch(err) {
                console.error("Button click error", err);
            }
        });

        // Right Click: Context Menu
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            elementToUpdateIndex = index;
            openModal();
        });
        
        buttonsContainer.appendChild(btn);
    });
    
    // Update window size if needed? 
    // The simplified auto-resize via CSS (clock size + padding) might not affect window size if window is fixed.
    // User asked "change clock size". If window is resizable, the user can just resize the window?
    // But user specifically said "clock size also change".
    // If I set --clock-size, the clock div resizes. Since window is transparent and resizable, it should be fine.
    
    updateClock();
}

// --- Clock Logic ---
function updateClock() {
  const now = new Date();
  
  const slots = config.slots || DEFAULT_CONFIG.slots;
  const activeSlot = config.activeSlot || 0;
  const currentTz = slots[activeSlot]?.tz || 'Asia/Tokyo';
  
  // Format: "14:30:05"
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: currentTz,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || 0, 10);
  
  const hours = getPart('hour');
  const minutes = getPart('minute');
  const seconds = getPart('second');

  // Calculate degrees
  const secondsDegrees = ((seconds / 60) * 360);
  const minutesDegrees = ((minutes / 60) * 360) + ((seconds / 60) * 6);
  const hoursDegrees = ((hours / 12) * 360) + ((minutes / 60) * 30);

  if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${secondsDegrees}deg)`;
  if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${minutesDegrees}deg)`;
  if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hoursDegrees}deg)`;

  // AM/PM Update
  const isPm = hours >= 12;
  if (amPmEl) {
     amPmEl.textContent = isPm ? 'PM' : 'AM';
  }
}

// --- Modal Logic ---
let elementToUpdateIndex = -1;
const CITIES_DB = [
    { code: 'TYO', tz: 'Asia/Tokyo', name: 'Tokyo', country: 'Japan' },
    { code: 'NYC', tz: 'America/New_York', name: 'New York', country: 'USA' },
    { code: 'LON', tz: 'Europe/London', name: 'London', country: 'UK' },
    { code: 'PAR', tz: 'Europe/Paris', name: 'Paris', country: 'France' },
    { code: 'HKG', tz: 'Asia/Hong_Kong', name: 'Hong Kong', country: 'China' },
    { code: 'LAX', tz: 'America/Los_Angeles', name: 'Los Angeles', country: 'USA' },
    { code: 'SFO', tz: 'America/Los_Angeles', name: 'San Francisco', country: 'USA' },
    { code: 'CHI', tz: 'America/Chicago', name: 'Chicago', country: 'USA' },
    { code: 'HNL', tz: 'Pacific/Honolulu', name: 'Honolulu', country: 'USA' },
    { code: 'YVR', tz: 'America/Vancouver', name: 'Vancouver', country: 'Canada' },
    { code: 'YYZ', tz: 'America/Toronto', name: 'Toronto', country: 'Canada' },
    { code: 'SAO', tz: 'America/Sao_Paulo', name: 'São Paulo', country: 'Brazil' },
    { code: 'BER', tz: 'Europe/Berlin', name: 'Berlin', country: 'Germany' },
    { code: 'IST', tz: 'Europe/Istanbul', name: 'Istanbul', country: 'Turkey' },
    { code: 'DXB', tz: 'Asia/Dubai', name: 'Dubai', country: 'UAE' },
    { code: 'BOM', tz: 'Asia/Kolkata', name: 'Mumbai', country: 'India' },
    { code: 'DEL', tz: 'Asia/Kolkata', name: 'New Delhi', country: 'India' },
    { code: 'BKK', tz: 'Asia/Bangkok', name: 'Bangkok', country: 'Thailand' },
    { code: 'SIN', tz: 'Asia/Singapore', name: 'Singapore', country: 'Singapore' },
    { code: 'SEL', tz: 'Asia/Seoul', name: 'Seoul', country: 'South Korea' },
    { code: 'PEK', tz: 'Asia/Shanghai', name: 'Beijing', country: 'China' },
    { code: 'TPE', tz: 'Asia/Taipei', name: 'Taipei', country: 'Taiwan' },
    { code: 'SYD', tz: 'Australia/Sydney', name: 'Sydney', country: 'Australia' },
    { code: 'AKL', tz: 'Pacific/Auckland', name: 'Auckland', country: 'New Zealand' },
    { code: 'UTC', tz: 'UTC', name: 'UTC', country: 'World' }
];

function openModal() {
    const modal = document.getElementById('city-modal');
    const list = document.getElementById('city-list');
    list.innerHTML = '';
    
    // Sort by name for easier finding
    const sortedCities = [...CITIES_DB].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

    sortedCities.forEach(city => {
        const btn = document.createElement('button');
        btn.className = 'city-option';
        // Display format: "Tokyo, Japan (TYO)"
        btn.textContent = `${city.name}, ${city.country} (${city.code})`;
        btn.onclick = () => {
             // Update config
             config.slots[elementToUpdateIndex] = { code: city.code, tz: city.tz };
             saveConfig(config);
             applyConfig();
             modal.classList.remove('open');
        };
        list.appendChild(btn);
    });
    
    modal.classList.add('open');
}

// Run
init();