const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  screen,
  session,
  desktopCapturer,
  dialog,
  shell,
  powerSaveBlocker,
  systemPreferences,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const {
  PRODUCTION,
  trustedPage,
  allowedPermission,
  SIZES,
} = require("./policy.cjs");

// A development origin is never honored by a distributed build.
const origin =
  !app.isPackaged && process.env.OFFER_QUEST_DESKTOP_URL
    ? new URL(process.env.OFFER_QUEST_DESKTOP_URL).origin
    : PRODUCTION;
if (
  origin !== PRODUCTION &&
  !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
)
  throw new Error("Development must use localhost");
if (!app.isPackaged && process.env.OFFER_QUEST_DESKTOP_TEST_DATA)
  app.setPath("userData", process.env.OFFER_QUEST_DESKTOP_TEST_DATA);
let win,
  tray,
  active = false,
  quitting = false,
  blocker,
  screenId;
const prefsPath = () => path.join(app.getPath("userData"), "widget.json");
function prefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), "utf8"));
  } catch {
    return {};
  }
}
function save(values) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(prefsPath(), JSON.stringify({ ...prefs(), ...values }));
}
function show() {
  win.show();
  win.focus();
}
function resize(mode) {
  const size = SIZES[mode];
  if (!size || !win) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(size[0], area.width),
    height = Math.min(size[1], area.height);
  win.setBounds({
    width,
    height,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
  });
}
function activity(value) {
  active = value;
  if (active && blocker === undefined)
    blocker = powerSaveBlocker.start("prevent-app-suspension");
  if (!active && blocker !== undefined) {
    powerSaveBlocker.stop(blocker);
    blocker = undefined;
  }
  tray?.setToolTip(active ? "学习进行中 · 点击查看" : "开始学习");
}
function own(event) {
  return (
    event.sender === win?.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    trustedPage(event.senderFrame.url, origin)
  );
}
async function load() {
  try {
    await win.loadURL(`${origin}/desktop`);
  } catch {
    if (!win.isDestroyed())
      await win.loadFile(path.join(__dirname, "offline.html"));
  }
}
function menus() {
  const items = [
    { label: "显示学习按钮", click: show },
    { label: "隐藏小组件（学习继续）", click: () => win.hide() },
    { type: "separator" },
    {
      label: "登录 Mac 时打开",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    {
      label: "更换下次共享的屏幕",
      click: () => {
        screenId = undefined;
        save({ screenId: null });
      },
    },
    {
      label: "查看网站记录",
      click: () => shell.openExternal(`${PRODUCTION}/study`),
    },
    {
      label: "重新连接",
      click: () => {
        if (!active) void load();
        else show();
      },
    },
    { type: "separator" },
    { label: "退出开始学习", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "开始学习", submenu: items },
      {
        label: "编辑",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
    ]),
  );
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) show();
  });
  app.whenReady().then(() => {
    const ses = session.fromPartition("persist:study");
    const trustedRequest = (contents, details) =>
      contents === win?.webContents &&
      details.isMainFrame === true &&
      trustedPage(details.requestingUrl, origin);
    ses.setPermissionCheckHandler(
      (contents, permission, requestingOrigin, details) =>
        requestingOrigin === origin &&
        trustedRequest(contents, details) &&
        allowedPermission(permission, details),
    );
    ses.setPermissionRequestHandler(
      async (contents, permission, callback, details) => {
        if (
          !trustedRequest(contents, details) ||
          !allowedPermission(permission, details)
        )
          return callback(false);
        if (permission === "media") {
          try {
            return callback(
              await systemPreferences.askForMediaAccess("camera"),
            );
          } catch {
            return callback(false);
          }
        }
        callback(true);
      },
    );
    screenId = prefs().screenId;
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      if (
        request.frame !== win.webContents.mainFrame ||
        !trustedPage(request.frame?.url, origin) ||
        !request.userGesture ||
        request.audioRequested ||
        !request.videoRequested
      )
        return callback({});
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
        });
        let source = sources.find((s) => s.id === screenId);
        if (!source) {
          const { response } = await dialog.showMessageBox(win, {
            type: "question",
            title: "学习时共享哪块屏幕？",
            message: "选择学习屏幕",
            detail:
              "教练只在查岗时截取一帧。之后每次开始学习会沿用此选择；可在菜单栏更换，或在学习设置里关闭屏幕共享。",
            buttons: [...sources.map((s) => s.name), "不共享"],
            cancelId: sources.length,
            defaultId: sources.length,
          });
          source = sources[response];
          if (source) {
            screenId = source.id;
            save({ screenId });
          }
        }
        callback(source ? { video: source } : {});
      } catch {
        callback({});
      }
    });
    const area = screen.getPrimaryDisplay().workArea;
    const saved = prefs();
    win = new BrowserWindow({
      width: 430,
      height: Math.min(700, area.height),
      x: saved.x ?? area.x + area.width - 454,
      y: saved.y ?? area.y + 40,
      title: "开始学习",
      frame: false,
      resizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      backgroundColor: "#f3f6fc",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        session: ses,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    resize("setup");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      if (!trustedPage(url, origin)) event.preventDefault();
    });
    win.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    win.webContents.on("render-process-gone", () => {
      activity(false);
      void load();
    });
    win.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        win.hide();
      }
    });
    win.on("moved", () => {
      const [x, y] = win.getPosition();
      save({ x, y });
    });
    const icon = nativeImage
      .createFromPath(path.join(__dirname, "icon.png"))
      .resize({ width: 18, height: 18 });
    tray = new Tray(icon);
    tray.setToolTip("开始学习");
    tray.on("click", show);
    menus();
    ipcMain.on("study:layout", (event, mode, running) => {
      if (!own(event) || !Object.hasOwn(SIZES, mode)) return;
      resize(mode);
      activity(running === true);
    });
    ipcMain.on("study:hide", (event) => {
      if (own(event)) win.hide();
    });
    ipcMain.on("study:website", (event) => {
      if (own(event)) void shell.openExternal(`${PRODUCTION}/study`);
    });
    win.once("ready-to-show", show);
    void load();
  });
  app.on("activate", () => {
    if (win) show();
  });
  app.on("before-quit", (event) => {
    if (active && !quitting) {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(win, {
        type: "warning",
        message: "学习还在进行，确定退出？",
        detail:
          "退出会停止摄像头和查岗，长时间离开会按现有规则结算。隐藏小组件可以继续学习。",
        buttons: ["继续学习", "退出"],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice !== 1) return;
      quitting = true;
      app.quit();
    } else quitting = true;
  });
}
