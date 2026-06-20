import { app, Menu, shell, type MenuItemConstructorOptions } from "electron";

export interface MenuHandlers {
  newFile: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  openRecent: (path: string) => void;
  about: () => void;
}

export interface BuildMenuOptions {
  isDev: boolean;
  recentFiles: string[];
  handlers: MenuHandlers;
}

export function buildMenu({ isDev, recentFiles, handlers }: BuildMenuOptions): Menu {
  const isMac = process.platform === "darwin";

  const recentSubmenu: MenuItemConstructorOptions[] =
    recentFiles.length > 0
      ? recentFiles.map((filePath) => ({
          label: filePath,
          click: () => handlers.openRecent(filePath),
        }))
      : [{ label: "No Recent Files", enabled: false }];

  const viewSubmenu: MenuItemConstructorOptions[] = [
    ...(isDev
      ? ([
          { role: "reload", accelerator: "CmdOrCtrl+R" },
          { role: "toggleDevTools" },
          { type: "separator" },
        ] as MenuItemConstructorOptions[])
      : []),
    { role: "resetZoom", label: "Actual Size" },
    { role: "zoomIn" },
    { role: "zoomOut" },
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        { label: "New File", accelerator: "CmdOrCtrl+N", click: handlers.newFile },
        { label: "Open...", accelerator: "CmdOrCtrl+O", click: handlers.open },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: handlers.save },
        { label: "Save As...", accelerator: "CmdOrCtrl+Shift+S", click: handlers.saveAs },
        { type: "separator" },
        { label: "Recent Files", submenu: recentSubmenu },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit", accelerator: "CmdOrCtrl+Q" },
      ],
    },
    {
      label: "Edit",
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
    {
      label: "View",
      submenu: viewSubmenu,
    },
    {
      role: "help",
      submenu: [
        { label: "About Inkwell", click: handlers.about },
        {
          label: "Project on GitHub",
          click: () => void shell.openExternal("https://github.com/anndunkin/inkwell"),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}
