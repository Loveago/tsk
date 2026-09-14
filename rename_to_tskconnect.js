const fs = require('fs');

function walk(dir) {
    if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('.next')) return;
    let list;
    try {
        list = fs.readdirSync(dir);
    } catch (e) { return; }
    
    list.forEach(function(file) {
        file = dir + '/' + file;
        let stat;
        try {
            stat = fs.statSync(file);
        } catch (e) { return; }
        
        if (stat && stat.isDirectory()) { 
            walk(file);
        } else if (!file.includes('package-lock.json')) {
            try {
                let content = fs.readFileSync(file, 'utf8');
                let newContent = content
                    .replace(/Tskconnect/g, 'Tskconnect')
                    .replace(/tskconnect/g, 'tskconnect')
                    .replace(/Tskconnect/g, 'Tskconnect')
                    .replace(/tskconnect/g, 'tskconnect')
                    .replace(/TSKCONNECT/g, 'TSKCONNECT')
                    .replace(/Tskconnect/g, 'Tskconnect')
                    .replace(/tskconnect/g, 'tskconnect')
                    .replace(/TSKCONNECT/g, 'TSKCONNECT');
                if (content !== newContent) {
                    fs.writeFileSync(file, newContent, 'utf8');
                    console.log('Updated', file);
                }
            } catch (e) {}
        }
    });
}
walk('.');
console.log("Sitewide replacement complete.");
