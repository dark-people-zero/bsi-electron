const fs  = require("fs");
const csv = require('csv-parser');

const readerCsv = async(dir) => {
    const results = {
        info: {},
        mutasi: []
    };
    var pipeCsv = csv({
        headers: [
            "No",
            'WaktuTransaksi',
            "NoReferensi",
            "NamaPengirim",
            "BankPengirim",
            "NamaPenerima",
            "BankPenerima",
            "Deskripsi",
            "Debet",
            "Kredit",
            "SaldoRiil",
            "Kode",
        ],
    
    })

    return new Promise((resolve, reject) => {
        fs.createReadStream(dir).pipe(pipeCsv).on('data', (data) => {
            if (data.No && data.No != "  ") {
                if (data.WaktuTransaksi) {
                    if (data.No != "No")
                        results.mutasi.push(data);
                } else {
                    var x = data.No.split(": ");
                    var key = x[0].replaceAll("\t", "").replaceAll("(dlm Periode)", "").split(" ").map(e => e ? e[0].toUpperCase() + e.substr(1) : e).join("");
                    var val = x[1].replaceAll("\t", "");
                    results.info[key] = val;
                }
            }
        }).on('end', () => {
            resolve(results);
        });
    })
}

module.exports = readerCsv;


