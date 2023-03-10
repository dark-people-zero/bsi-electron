const { ipcRenderer } = require('electron');
const moment = require("moment");
moment.locale('id');
var dataRekening = ipcRenderer.sendSync("active-list-rekening");
document.addEventListener("DOMContentLoaded", () => {
    window.$ = window.jQuery = require("jquery");
    console.log("loaded");
    func.init();
})

const func = {
    init: () => {
        if (document.body.textContent.includes('Login ke BSI Net')) {
            func.login();
        }
    },
    login: () => {
        setTimeout(() => {
            $('#name').val(dataRekening.username);
            $('#exampleInputPassword1').val(dataRekening.password);
            $("#capcha").focus();
        }, 1000);
    }
}

var statusRobot = false;
var interValRobot, intTime;
var time = dataRekening.interval;

ipcRenderer.on("reload", (e) => {
    window.location.reload();
})

ipcRenderer.on("start", (e) => {
    if (!statusRobot) {
        statusRobot = true;
        var span = $(`<span style=" display: flex; justify-content: center; align-items: center; font-size: 25px; color: #fff; margin-left: 20px; font-weight: bold;">${time}</span>`);
        intTime = setInterval(() => {
            time = time - 1;
            span.text(time);
            if (time == 0) time = dataRekening.interval;
        }, 1000);
        $('.kalender').append(span);
        interValRobot = setInterval(() => {
            // document.querySelector('button[type="submit"]').click();
            time = dataRekening.interval;
            span.text(time);
        }, dataRekening.interval*1000);
    }
})

ipcRenderer.on("stop", (e) => {
    statusRobot = false;
    clearInterval(interValRobot);
    clearInterval(intTime);
})

ipcRenderer.on("getMutasi", (event) => {
    var date = document.querySelector('input[name="duration"]').value;
    date = date.split(' - ')[1];
    date = moment(date, "DD MMM YYYY").format('YYYY-MM-DD');
    var tr = document.querySelectorAll('.table tbody tr');
    var dt = [...tr].map(e => {
        var dateReal = e.children[0].textContent;
        if (dateReal.toLocaleLowerCase().includes('pend')) {
            dateReal = date;
        }else{
            dateReal = moment(dateReal, "DD/MM").format("YYYY-MM-DD");
        }
        var trxDt = dateReal
        var trailer = e.children[1].textContent
        var txnAmount = e.children[2].textContent
        var txnType = e.children[2].classList.contains('text-danger') ? 'D' : 'C';
        return {
            trxDt, trailer, txnAmount, txnType
        }
    });

    var section = document.querySelector('.table').closest('section');
    var small = section.querySelectorAll('small');
    small = [...small].find(e => e.textContent.toLocaleLowerCase().includes('saldo akhir'))
    var saldo = small.closest('div').querySelector('h5').textContent;
    
    ipcRenderer.send("update-mutasi", {
        rek: dataRekening,
        data: {
            saldo: saldo,
            mutasi: dt,
            startDate: dt[0].trxDt,
            endDate: dt[0].trxDt
        }
    });
})