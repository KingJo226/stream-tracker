interface StreamData { title: string; viewersCount: number; createdAt: string; game: { name: string } | null; }
interface TwitchUser { displayName: string; profileImageURL: string | null; stream: StreamData | null; }
interface GraphQLResponse { data?: { user?: TwitchUser; }; }
interface ChannelInfo { exists: boolean; displayName: string; avatar: string | null; isLive: boolean; title: string | null; viewers: number; game: string | null; startedAt: string | null; }
interface TimerState { [channel: string]: { timerId: number | null; }; }

const TWITCH_GQL_URL: string = 'https://gql.twitch.tv/gql';
const CLIENT_ID: string = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const STORAGE_KEY: string = 'stream_pulse_channels_v1';
const DEFAULT_CHANNELS: string[] = ['frik0vna'];
const PARENT_DOMAIN: string = 'kingjo226.github.io';
const IS_MOBILE: boolean = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 600;

const state: TimerState = {};
let channels: string[] = [];
let globalIntervalId: number | null = null;
let particlesCreated: boolean = false;
let openStreams: Set<string> = new Set();

function loadChannels(): string[] {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) { console.warn('Ошибка загрузки:', e); }
    return [...DEFAULT_CHANNELS];
}

function saveChannels(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(channels)); }
    catch (e) { console.warn('Ошибка сохранения:', e); }
}

function createParticles(): void {
    if (particlesCreated) return;
    particlesCreated = true;
    const container = document.getElementById('particles');
    if (!container) return;
    const count = IS_MOBILE ? 10 : 24;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 4 + 1.5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (Math.random() * 14 + 10) + 's';
        p.style.animationDelay = (Math.random() * 14) + 's';
        container.appendChild(p);
    }
}

async function fetchStreamStatus(channelName: string): Promise<ChannelInfo> {
    const query = {
        query: `query($login: String!) { user(login: $login) { displayName profileImageURL(width: 100) stream { title viewersCount createdAt game { name } } } }`,
        variables: { login: channelName.toLowerCase() }
    };
    try {
        const response = await fetch(TWITCH_GQL_URL, {
            method: 'POST',
            headers: { 'Client-ID': CLIENT_ID, 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
        });
        if (!response.ok) throw new Error('Network error');
        const data: GraphQLResponse = await response.json();
        if (!data.data || !data.data.user) throw new Error('Not found');
        const user = data.data.user;
        const stream = user.stream;
        return {
            exists: true, displayName: user.displayName, avatar: user.profileImageURL,
            isLive: !!stream, title: stream ? stream.title : null,
            viewers: stream ? stream.viewersCount : 0,
            game: stream && stream.game ? stream.game.name : null,
            startedAt: stream ? stream.createdAt : null
        };
    } catch (error) {
        return { exists: false, displayName: channelName, avatar: null, isLive: false, title: null, viewers: 0, game: null, startedAt: null };
    }
}

function formatDuration(ms: number): string {
    if (ms < 0 || !isFinite(ms)) return '00:00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const brokenAvatars: Set<string> = new Set();

function buildAvatarContent(channel: string, displayName: string, avatarUrl: string | null): string {
    const letter = (displayName || channel || '?').charAt(0).toUpperCase();
    const placeholder = `<span class="avatar-letter">${escapeHtml(letter)}</span>`;
    if (!avatarUrl || brokenAvatars.has(avatarUrl)) return placeholder;
    return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}" referrerpolicy="no-referrer" loading="lazy" onerror="handleAvatarError(this)">`;
}

(window as any).handleAvatarError = function(img: HTMLImageElement): void {
    const src = img.getAttribute('src');
    if (src) brokenAvatars.add(src);
    const parent = img.parentElement;
    const letter = (img.getAttribute('alt') || '?').charAt(0).toUpperCase();
    if (parent) parent.innerHTML = `<span class="avatar-letter">${escapeHtml(letter)}</span>`;
};

function render(): void {
    const grid = document.getElementById('grid');
    const empty = document.getElementById('emptyState');
    if (!grid || !empty) return;
    if (channels.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    Array.from(grid.children).forEach(card => {
        const el = card as HTMLElement;
        if (!channels.includes(el.dataset.channel || '')) el.remove();
    });
    channels.forEach((channel, index) => {
        let card = grid.querySelector(`[data-channel="${channel}"]`) as HTMLElement | null;
        if (!card) { card = createCard(channel); grid.appendChild(card); }
        if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index]);
    });
}

function createCard(channel: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.channel = channel;
    card.innerHTML = `
        <div class="card-head">
            <div class="avatar-wrap">
                <div class="avatar-ring"></div>
                <div class="avatar" data-role="avatar"><span class="avatar-letter">${escapeHtml(channel.charAt(0))}</span></div>
            </div>
            <div class="card-title">
                <div class="name" data-role="name">${escapeHtml(channel)}</div>
                <div class="handle" data-role="handle">twitch.tv/${escapeHtml(channel)}</div>
            </div>
            <button class="remove-btn" data-role="remove">✕</button>
        </div>
        <div class="status offline" data-role="status"><span class="dot"></span><span data-role="status-text">Проверка...</span></div>
        <div class="stream-info hidden" data-role="info">
            <span class="label">Сейчас в эфире</span>
            <div class="title" data-role="title">—</div>
            <div class="meta-row"><span data-role="game">—</span><span class="viewers" data-role="viewers">0</span></div>
            <div class="duration-row"><span>Длительность</span><span class="duration" data-role="duration">00:00:00</span></div>
        </div>
        <button class="watch-btn hidden" data-role="watch" onclick="openStream('${escapeHtml(channel)}')">▶ Смотреть</button>
    `;
    card.querySelector('[data-role="remove"]')?.addEventListener('click', (e) => { e.stopPropagation(); removeChannel(channel); });
    return card;
}

function updateCard(channel: string, data: ChannelInfo): void {
    const card = document.querySelector(`[data-channel="${channel}"]`) as HTMLElement | null;
    if (!card) return;
    const statusEl = card.querySelector('[data-role="status"]') as HTMLElement;
    const infoEl = card.querySelector('[data-role="info"]') as HTMLElement;
    const watchBtn = card.querySelector('[data-role="watch"]') as HTMLElement;
    const nameEl = card.querySelector('[data-role="name"]') as HTMLElement;
    const avatarEl = card.querySelector('[data-role="avatar"]') as HTMLElement;
    if (!data.exists) {
        statusEl.className = 'status offline';
        const st = statusEl.querySelector('[data-role="status-text"]');
        if (st) st.textContent = 'Не найден';
        infoEl.classList.add('hidden'); watchBtn.classList.add('hidden'); card.classList.remove('live');
        return;
    }
    if (nameEl) nameEl.textContent = data.displayName;
    if (data.avatar && !avatarEl.querySelector('img')) avatarEl.innerHTML = buildAvatarContent(channel, data.displayName, data.avatar);
    if (data.isLive) {
        statusEl.className = 'status online';
        const st = statusEl.querySelector('[data-role="status-text"]');
        if (st) st.textContent = 'В ЭФИРЕ';
        infoEl.classList.remove('hidden'); watchBtn.classList.remove('hidden'); card.classList.add('live');
        const titleEl = card.querySelector('[data-role="title"]') as HTMLElement;
        const gameEl = card.querySelector('[data-role="game"]') as HTMLElement;
        const viewersEl = card.querySelector('[data-role="viewers"]') as HTMLElement;
        if (titleEl) titleEl.textContent = data.title || '—';
        if (gameEl) gameEl.textContent = data.game || '—';
        if (viewersEl) viewersEl.textContent = `${data.viewers} зрителей`;
        const startedMs = new Date(data.startedAt || '').getTime();
        if (!state[channel]?.timerId) {
            state[channel] = { timerId: null };
            state[channel].timerId = window.setInterval(() => {
                const el = document.querySelector(`[data-channel="${channel}"] [data-role="duration"]`) as HTMLElement;
                if (el) el.textContent = formatDuration(Date.now() - startedMs);
            }, 1000);
        }
    } else {
        statusEl.className = 'status offline';
        const st = statusEl.querySelector('[data-role="status-text"]');
        if (st) st.textContent = 'ОФФЛАЙН';
        infoEl.classList.add('hidden'); watchBtn.classList.add('hidden'); card.classList.remove('live');
        if (state[channel]?.timerId) { clearInterval(state[channel].timerId); state[channel].timerId = null; }
    }
}

async function checkChannel(channel: string): Promise<void> {
    const data = await fetchStreamStatus(channel);
    updateCard(channel, data);
}

async function checkAll(): Promise<void> {
    await Promise.all(channels.map(ch => checkChannel(ch)));
}

function addChannel(): void {
    const input = document.getElementById('channelInput') as HTMLInputElement;
    const raw = input.value.trim().toLowerCase();
    if (!raw) return;
    const name = raw.replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/\/.*$/, '').trim();
    if (!name || channels.includes(name)) return;
    channels.push(name); saveChannels(); render(); input.value = ''; input.blur(); checkChannel(name);
}

function removeChannel(channel: string): void {
    channels = channels.filter(c => c !== channel); saveChannels(); closeStream(channel); render();
}

function openStream(channel: string): void {
    if (openStreams.has(channel)) return;
    openStreams.add(channel); renderStreams();
    document.getElementById('streamsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeStream(channel: string): void { openStreams.delete(channel); renderStreams(); }
function closeAllStreams(): void { openStreams.clear(); renderStreams(); }

function renderStreams(): void {
    const section = document.getElementById('streamsSection');
    const grid = document.getElementById('streamsGrid');
    const count = document.getElementById('streamsCount');
    if (!section || !grid || !count) return;
    if (openStreams.size === 0) { section.classList.add('hidden'); grid.innerHTML = ''; return; }
    section.classList.remove('hidden'); count.textContent = String(openStreams.size);
    Array.from(grid.children).forEach(el => {
        const item = el as HTMLElement;
        if (!openStreams.has(item.dataset.channel || '')) item.remove();
    });
    openStreams.forEach(channel => {
        if (grid.querySelector(`.stream-player[data-channel="${channel}"]`)) return;
        const player = document.createElement('div');
        player.className = 'stream-player';
        player.dataset.channel = channel;
        player.innerHTML = `
            <div class="stream-player-head">
                <div class="stream-player-title"><span class="live-dot"></span><span class="name">${escapeHtml(channel)}</span></div>
                <button class="stream-player-close" onclick="closeStream('${escapeHtml(channel)}')">✕</button>
            </div>
            <div class="stream-player-body">
                <div class="stream-player-video">
                    <iframe src="https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${PARENT_DOMAIN}&autoplay=true&muted=true" allowfullscreen allow="autoplay; fullscreen"></iframe>
                </div>
                <div class="stream-player-chat">
                    <iframe src="https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${PARENT_DOMAIN}&darkpopout" allowfullscreen></iframe>
                </div>
            </div>
        `;
        grid.appendChild(player);
    });
}

document.getElementById('channelInput')?.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addChannel();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAll(); });

window.addEventListener('load', () => {
    createParticles();
    channels = loadChannels();
    render();
    checkAll();
    globalIntervalId = window.setInterval(() => { if (!document.hidden) checkAll(); }, 60000);
});

(window as any).addChannel = addChannel;
(window as any).openStream = openStream;
(window as any).closeStream = closeStream;
(window as any).closeAllStreams = closeAllStreams;
(window as any).removeChannel = removeChannel;