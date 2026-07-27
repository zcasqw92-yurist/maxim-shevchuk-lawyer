const MOSCOW_TIME_ZONE = "Europe/Moscow";
const MOSCOW_UTC_OFFSET_HOURS = 3;
const ONLINE_FROM_HOUR = 8;
const ONLINE_UNTIL_HOUR = 23;

export const moscowHour = (date = new Date()) => {
  try {
    const hour = new Intl.DateTimeFormat("ru-RU", {
      timeZone: MOSCOW_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .find((part) => part.type === "hour")?.value;
    return Number(hour);
  } catch {
    const moscowDate = new Date(date.getTime() + (MOSCOW_UTC_OFFSET_HOURS * 60 * 60 * 1000));
    return moscowDate.getUTCHours();
  }
};

export const isOnlineAt = (date = new Date()) => {
  const hour = moscowHour(date);
  return hour >= ONLINE_FROM_HOUR && hour < ONLINE_UNTIL_HOUR;
};

export const updateOnlineStatus = (root = document, date = new Date()) => {
  const online = isOnlineAt(date);
  root.querySelectorAll("[data-online-status]").forEach((status) => {
    status.classList.toggle("is-offline", !online);
    const label = status.querySelector("[data-online-label]");
    if (label) {
      label.textContent = status.classList.contains("header__online")
        ? (online ? "Юрист онлайн" : "Юрист офлайн")
        : (online ? "На связи в мессенджерах" : "Сейчас офлайн · отвечу после 08:00 МСК");
    }
    if (status.classList.contains("header__online")) {
      status.setAttribute("aria-label", `${online ? "Юрист онлайн" : "Юрист офлайн"} — задать вопрос`);
    }
  });
};

export const startOnlineStatus = (root = document) => {
  updateOnlineStatus(root);
  return window.setInterval(() => updateOnlineStatus(root), 60_000);
};
