'use strict';

const electron = require('electron');

const {app, Menu, Tray, net, clipboard} = require('electron');
const path  = require('path');
const Store = require('./store.js');
const async = require("async");

const {autoUpdater} = require("electron-updater");

// Adds debug features like hotkeys for triggering dev tools and reload
require('electron-debug')({showDevTools: false});
console.log(process.platform);

var mainWindow;
var background;
var overlay;
var tray = null;
var closeToTray = true;

const ipc = electron.ipcMain;

//Debug stuff
ipc.on('ipc_switch', function (event, method, arg) {
    //console.log("IPC ", method);
    switch (method) {
        case 'ipc_log':
            console.log("IPC LOG: ", arg);
            break;

        // to renderer

        case 'set_settings':
            //console.log("set settings: ", arg);
            saveSettings(arg);
            mainWindow.webContents.send("set_settings", arg);
            overlay.webContents.send("set_settings", arg);
            break;

        case 'background_set_history':
            mainWindow.webContents.send("set_history", arg);
            break;

        case 'background_set_history_data':
            mainWindow.webContents.send("set_history_data", arg);
            break;

        case 'set_economy':
            mainWindow.webContents.send("set_economy", arg);
            break;

        case 'renderer_set_bounds':
            mainWindow.setBounds(arg);
            break;

        case 'renderer_window_minimize':
            mainWindow.minimize();
            break;

        case 'no_log':
            mainWindow.webContents.send("no_log", arg);
            break;

        case 'set_username':
            mainWindow.webContents.send("set_username", arg);
            break;

        case 'set_rank':
            mainWindow.webContents.send("set_rank", arg.rank, arg.str);
            break;

        case 'set_decks':
            mainWindow.webContents.send("set_decks", arg);
            break;

        case 'set_cards':
            mainWindow.webContents.send("set_cards", arg.cards, arg.new);
            break;

        case 'initialize':
            mainWindow.webContents.send("initialize", arg);
            break;

        case 'set_explore':
            mainWindow.webContents.send("set_explore", arg);
            break;

        case 'open_course_deck':
            mainWindow.webContents.send("open_course_deck", arg);
            break;

        // to background
        case 'request_explore':
            background.webContents.send("request_explore", arg);
            break;

        case 'renderer_get_economy':
            background.webContents.send("set_economy", 1);
            break;

        case 'renderer_state':
            showWindow();
            background.webContents.send("set_renderer_state", arg);
            break;

        case 'save_settings':
            saveSettings(arg);
            background.webContents.send("save_settings", arg);
            overlay.webContents.send("set_settings", arg);
            break;

        case 'renderer_erase_data':
            background.webContents.send("delete_data", 1);
            httpDeleteData();
            break;

        case 'renderer_update_install':
            background.webContents.send("update_install", 1);
            break;

        case 'renderer_request_history':
            background.webContents.send("request_history", arg);
            break;

        case 'renderer_request_explore':
            background.webContents.send("request_explore", arg);
            break;

        case 'renderer_request_course':
            background.webContents.send("request_course", arg);
            break;

        case 'overlay_set_deck_mode':
            background.webContents.send("set_deck_mode", arg);
            break;

        // to overlay

        case 'set_deck':
            overlay.webContents.send("set_deck", arg);
            break;

        case 'set_draft':
            overlay.webContents.send("set_draft", arg);
            break;

        case 'set_draft_picks':
            overlay.webContents.send("set_draft_picks", arg);
            break;

        case 'set_timer':
            overlay.webContents.send("set_timer", arg);
            break;

        case 'set_opponent':
            overlay.webContents.send("set_opponent", arg);
            break;

        case 'set_opponent_rank':
            overlay.webContents.send("set_opponent_rank", arg.rank, arg.str);
            break;

        // to main js / window handling

        case 'show_background':
            background.show();
            break;

        case 'renderer_show':
            showWindow();
            break;

        case 'renderer_hide':
            hideWindow();
            break;

        case 'renderer_window_close':
            if (closeToTray) {
                hideWindow();
            }
            else {
                quit();
            }
            break;

        case 'set_close_to_tray':
            closeToTray = arg;
            break;

        case 'overlay_show':
            if (!overlay.isVisible()) {
                overlay.show();
            }
            break;

        case 'overlay_close':
            overlay.hide();
            break;

        case 'overlay_minimize':
            overlay.minimize();
            break;

        case 'overlay_set_bounds':
            overlay.setBounds(arg);
            break;

        case 'save_overlay_pos':
            saveOverlayPos();
            break;

        case 'force_open_settings':
            mainWindow.webContents.send("force_open_settings", true);
            showWindow();
            break;

        case 'set_clipboard':
            clipboard.writeText(arg);
            break;

        default:
            console.log("IPC Switch unknown method ", method);
            break;
    }
});

function saveSettings(settings) {
    app.setLoginItemSettings({
        openAtLogin: settings.startup
    });
    closeToTray = settings.close_to_tray;
}

//
ipc.on('set_draft_cards', function(event, pack, picks, packn, pickn) {
    overlay.webContents.send("set_draft_cards", pack, picks, packn, pickn);
});

//
ipc.on('set_turn', function(event, playerSeat, turnPhase, turnStep, turnNumber, turnActive, turnPriority, turnDecision) {
    overlay.webContents.send("set_turn", playerSeat, turnPhase, turnStep, turnNumber, turnActive, turnPriority, turnDecision);
});


// Catch exceptions
process.on('uncaughtException', function (err) {
    console.log('Uncaught exception;');
    console.log(err.stack);
    //console.log('Current chunk:',  currentChunk);
});

/*
    Auto update stuff
*/
autoUpdater.on('checking-for-update', () => {
    updateState = 0;
    sendUpdateState();
    console.log('Auto updater:', 'Checking for update...');
})

autoUpdater.on('update-available', (info) => {
    updateState = 1;
    updateAvailable = true;
    sendUpdateState();
    console.log('Auto updater:', 'Update available.');
    mainWindow.webContents.send("show_notification", "Update available");
})

autoUpdater.on('update-not-available', (info) => {
    updateState = -1;
    updateAvailable = false;
    sendUpdateState();
    console.log('Auto updater:', 'Update not available.');
})

autoUpdater.on('error', (err) => {
    updateState = -2;
    updateAvailable = false;
    sendUpdateState();
    console.log('Auto updater:', 'Error in auto-updater. ' + err);
})

autoUpdater.on('download-progress', (progressObj) => {
    updateState = 2;
    updateProgress = Math.round(progressObj.percent * 100) / 100;
    updateSpeed = progressObj.bytesPerSecond;
    sendUpdateState();

    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log('Auto updater:', log_message);
})

autoUpdater.on('update-downloaded', (info) => {
    updateState = 3;
    sendUpdateState();
    mainWindow.webContents.send("show_notification", "Update downloaded");
    console.log('Auto updater:', 'Update downloaded');
});

function sendUpdateState() {
    var state = {state: updateState, available: updateAvailable, progress: updateProgress, speed: updateSpeed};
    mainWindow.webContents.send("set_update", state);
}

function onClosed() {
    mainWindow = null;
}

function onOverlayClosed() {
    overlay = null;
}

function hideWindow() {
    if (mainWindow.isVisible()) {
        mainWindow.hide()
    }
}

function toggleWindow() {
    if (mainWindow.isVisible()) {
        if (!mainWindow.isMinimized()) {
            mainWindow.minimize();
        }
        else {
            showWindow();
        }
    } else {
        showWindow();
    }
}

function showWindow() {
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
}

function quit() {
    if (process.platform !== 'darwin') {
        app.quit();
    }
}

function saveWindowPos() {
	var obj = {};
	var bounds = mainWindow.getBounds();
	var pos = mainWindow.getPosition();
	obj.width = Math.floor(bounds.width);
	obj.height = Math.floor(bounds.height);
	obj.x = Math.floor(pos[0]);
	obj.y = Math.floor(pos[1]);
    background.webContents.send('windowBounds', obj);
}

function saveOverlayPos() {
	var obj = {};
	var bounds = overlay.getBounds();
	var pos = overlay.getPosition();
	obj.width = Math.floor(bounds.width);
	obj.height = Math.floor(bounds.height);
	obj.x = Math.floor(pos[0]);
	obj.y = Math.floor(pos[1]);
    background.webContents.send('overlayBounds', obj);
}

function createBackgroundWindow() {
    const win = new electron.BrowserWindow({
        frame: false,
        x: 0,
        y: 0,
        show: false,
        width: 100,
        height: 100,
        title: "MTG Arena Tool",
        icon:'icon.png'
    });
    win.loadURL(`file://${__dirname}/window_background/index.html`);
    win.on('closed', onClosed);

    return win;
}

function createMainWindow() {
    const win = new electron.BrowserWindow({
        /*transparent: true,*/
        backgroundColor: '#000',
        frame: false,
        show: false,
        width: 800,
        height: 600,
        title: "MTG Arena Tool",
        icon:'icon.png'
    });
    win.loadURL(`file://${__dirname}/window_main/index.html`);
    win.on('closed', onClosed);

    let iconPath = path.join(__dirname, 'icon.png');
    if (process.platform == 'win32') {
        iconPath = path.join(__dirname, 'icon.ico');
    }
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      {label: 'Show', click: () => { showWindow();}},
      {label: 'Quit', click: () => { quit();}}
    ])
    tray.on('double-click', toggleWindow);
    tray.setToolTip('MTG Arena Tool');
    tray.setContextMenu(contextMenu);

	win.on('resize', (e) => {
		saveWindowPos();
	});

    return win;
}

function createOverlay() {
    const over = new electron.BrowserWindow({
        /*transparent: true,*/
        frame: false,
        alwaysOnTop: true,
        x: 0,
        y: 0,
        width: 300,
        height: 600,
        show: false,
        title: "MTG Arena Tool",
        icon:'images/icon.png'
    });
    over.loadURL(`file://${__dirname}/window_overlay/index.html`);
    over.on('closed', onOverlayClosed);

	over.on('resize', () => {
		saveOverlayPos();
	});
    /*
    setTimeout( function() {
        overlay.webContents.send("set_deck", currentDeck);
    	//debug_overlay_show();
    }, 1000);
    */
    return over;
}

app.on('window-all-closed', () => {
    quit();
});

app.on('activate', () => {
    if (!mainWindow) {
        mainWindow = createMainWindow();
    }
});

app.on('ready', () => {
    mainWindow = createMainWindow();
    overlay = createOverlay();
    background = createBackgroundWindow();
    autoUpdater.checkForUpdatesAndNotify();
});
