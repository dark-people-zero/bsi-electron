const {app, BrowserWindow, ipcMain, Menu} = require('electron');
const log = require('electron-log');
const { autoUpdater } = require("electron-updater");
const isDev = require("electron-is-dev");
const path = require("path");
const fs = require("fs");
const io = require("socket.io-client");
const os = require('os');
const readerCsv = require("./readerCsv");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const moment = require("moment");
const storage = require('electron-json-storage');
storage.setDataPath(os.tmpdir());

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
var statusRobot = false;
var templateMenu = [
    {
        label: 'Start Robot',
        click() {
            if (!statusRobot) {
                statusRobot = true;
                var rekActive = dataRekening.active();
                func.timeInterval();
                setTimeout(() => {
                    func.mutasiAndSaldo();
                }, rekActive.interval*1000);
            }
        }
    },
    {
        label: 'Stop Robot',
        click() {
            func.stoptimeInterval();
            statusRobot = false;
        }
    },
    {
        label: 'Reload',
        click() {
            bankWindows.webContents.executeJavaScript(`window.location.reload()`);
        }
    }
]

let starting, listRekening, bankWindows, socket;
function sendStatusToWindow(text) {
    log.info(text);
    starting.webContents.send('message', text);
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function createStarting() {
    starting = new BrowserWindow({
        frame: false,
        minWidth: 100,
        minHeight: 100,
        height: 100,
        width: 100,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        resizable: false,
    });
    // starting.webContents.openDevTools();
    starting.on('closed', () => starting = null);
    starting.loadURL(`file://${__dirname}/pages/starting.html#v${app.getVersion()}`);
    setTimeout(() => {
        if (isDev) {
            func.init();
        }else{
            autoUpdater.checkForUpdatesAndNotify();
        }
    }, 500);
}

function listRekeningWindows() {
    listRekening = new BrowserWindow({
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        resizable: false
    });
    listRekening.on('closed', () => listRekening = null);
    listRekening.loadURL(`file://${__dirname}/pages/list-rekening.html`);
    // listRekening.webContents.openDevTools();
}

function createBankWindows() {
    bankWindows = new BrowserWindow({
        // autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            // preload: path.join(__dirname, "preload/bsi.js")
        },
        resizable: false
    });
    bankWindows.on('closed', () => {
        bankWindows = null;
        dataRekening.reset();
        listRekeningWindows();
    });
    var urlSaldo = "https://bsinet.bankbsi.co.id/cms/index.php?title=Tabungan%20dan%20Giro&cmd=CMD_REK_TAB",
        urlLogin = "https://bsinet.bankbsi.co.id/cms/phpcaptcha/captcha.php?*",
        rekActive = dataRekening.active();
    bankWindows.webContents.session.webRequest.onCompleted({
        urls: [
            urlSaldo,
            urlLogin
        ]
    }, (res) => {
        if (res.url.includes("captcha.php")) {
            bankWindows.webContents.executeJavaScript(`
                document.querySelector('#name').value = "${rekActive.username}";
                document.querySelector('#exampleInputPassword1').value = "${rekActive.password}";
                document.querySelector("#capcha").focus();
            `);
        }

        if (res.url == urlSaldo) {
            bankWindows.webContents.executeJavaScript("document.querySelector('.table').outerHTML;", true).then(e => {
                const dom = new JSDOM(e);
                var td = dom.window.document.querySelectorAll(".table tbody tr td");
                var dt = [...td].map(e => e.textContent.replaceAll("\n", ""));
                socket.emit("updateData", {
                    type: "saldo",
                    rek: rekActive,
                    data: dt,
                    date: moment().format("YYYY-MM-DD")
                });
            });
        }
    })

    bankWindows.webContents.session.on("will-download", (event, item, webContent) => {
        item.setSavePath(path.join(os.tmpdir(),item.getFilename()));
        item.on('updated', (event, state) => {
            if (state === 'interrupted') {
                console.log('Download is interrupted but can be resumed')
            }
        })
        item.once('done', async (event, state) => {
            if (state === 'completed') {
                const now = moment().format("YYYY-MM-DD");
                var data = await readerCsv(item.getSavePath());
                var rek = dataRekening.active();
                socket.emit("updateData", {
                    type: "mutasi",
                    rek: rek,
                    data: data,
                    date: now
                });
                func.timeInterval();
                setTimeout(() => {
                    if (statusRobot) func.mutasiAndSaldo();
                }, rek.interval*1000);
            } else {
              console.log(`Download failed: ${state}`)
            }
        })
    })

    
    bankWindows.webContents.session.clearCache();
    bankWindows.webContents.session.clearStorageData();
    bankWindows.loadURL('https://bsinet.bankbsi.co.id/cms/');
    // bankWindows.webContents.openDevTools();
}

const func = {
    init: () => {
        starting.close();
        listRekeningWindows();
    },
    playMutasi: () => {
        listRekening.close();
        createBankWindows();
    },
    timeInterval: () => {
        var rekActive = dataRekening.active();
        bankWindows.webContents.executeJavaScript(`
            var timeDefault = ${rekActive.interval};
            var time = timeDefault;
            var span = document.createElement("span");
            span.setAttribute("style", "display: flex; justify-content: center; align-items: center; font-size: 25px; color: #fff; margin-left: 20px; font-weight: bold;");
            span.textContent = time;
            var intTime = setInterval(() => {
                time = time - 1;
                span.textContent = time;
                if (time == 0) {
                    time = timeDefault;
                    span.textContent = time;
                }
            }, 1000);
            document.querySelector('.kalender').append(span);
        `);
    },
    stoptimeInterval: () => {
        bankWindows.webContents.executeJavaScript('clearInterval(intTime)');
    },
    mutasiAndSaldo: () => {
        var rekActive = dataRekening.active();
        bankWindows.webContents.executeJavaScript(`window.location.href = "https://bsinet.bankbsi.co.id/cms/index.php?title=Tabungan%20dan%20Giro&cmd=CMD_REK_TAB"`, true).then(e => {
            setTimeout(() => {
                bankWindows.webContents.executeJavaScript(`window.location.href = "https://bsinet.bankbsi.co.id/cms/index.php?title=Mutasi%20Rekening&cmd=CMD_REK_TAB_TRN"`, true).then(e => {
                    setTimeout(() => {
                        bankWindows.webContents.executeJavaScript(`
                            document.querySelector("#MY_ACC").value = "${rekActive.norek}";
                            var date = document.querySelector('.kalender .date').textContent;
                            document.querySelector('#DATE_FROM').value = date;
                            document.querySelector('#DATE_UNTIL').value = date;
                            document.querySelector("#mysubmit").click();
                        `, true).then(e => {
                            setTimeout(() => {
                                bankWindows.webContents.executeJavaScript(`
                                    var x = setInterval(() => {
                                        var target = document.querySelector("#mysubmitLoop");
                                        if (target) {
                                            clearInterval(x);
                                            document.querySelector('select[name="Format File"]').value = "csv";
                                            target.click();
                                        }
                                    }, 1000);
                                `);
                            }, 5000);
                        })
                    }, 1000);
                })
            }, 3000);
        });
    }
}

const dataRekening = {
    has: () => {
        storage.has('list-rekening-bsi', function(error, hasKey) {
            if (error) throw error;
          
            if (!hasKey) {
                storage.set('list-rekening-bsi', [], function(error) {
                    if (error) throw error;
                });
            }
        });
    },
    get: () => {
        return storage.getSync('list-rekening-bsi');
    },
    put: (data) => {
        storage.set('list-rekening-bsi', data, function(error) {
            if (error) throw error;
        });
    },
    active: () => {
        var data = dataRekening.get();
        return data.find(e => e.status);
    },
    reset: () => {
        var data = dataRekening.get();
        data = data.map(e => {
            e.status = false;
            return e;
        });
        
        storage.set('list-rekening-bsi', data, function(error) {
            if (error) throw error;
        });

    },
    clear: () => {
        storage.clear(function(error) {
            if (error) throw error;
        });
    }
}

ipcMain.on("get-list-rekening", (event) => event.returnValue = dataRekening.get());
ipcMain.on("put-list-rekening", (event, data) => dataRekening.put(data));
ipcMain.on("active-list-rekening", (event) => event.returnValue = dataRekening.active());
ipcMain.on("play-mutasi", (event) => func.playMutasi());

ipcMain.on("update-mutasi", (e, res) => {
    socket.emit("updateData", {
        type: "mutasi",
        rek: res.rek,
        data: res.data
    });
})

autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow("Check Vesion");
})

autoUpdater.on('update-available', (info) => {
    sendStatusToWindow("Update Available");
})

autoUpdater.on('error', (err) => {
    sendStatusToWindow('Error in auto-updater. ' + err);
})

autoUpdater.on('download-progress', (progressObj) => {
    var percent = Math.ceil(progressObj.percent);
    var transferred = formatBytes(progressObj.transferred);
    var total = formatBytes(progressObj.total);
    var speed = formatBytes(progressObj.bytesPerSecond);
    
    sendStatusToWindow('Downloaded ' + percent + '%');
    starting.webContents.send("download", {
        total: ' (' + transferred + "/" + total + ')',
        network: speed
    })
})

autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('Update downloaded');
    autoUpdater.quitAndInstall();
});

autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('Update not available.');
    func.init();
})

app.on('ready', function() {
    const menu = Menu.buildFromTemplate(templateMenu);
    Menu.setApplicationMenu(menu);
    createStarting();
    // socket = io.connect("http://54.151.144.228:9992");
    socket = io.connect("http://localhost:9991");
    dataRekening.has();
});

app.on('window-all-closed', () => {
    if (process.platform !== "darwin") app.quit();
});