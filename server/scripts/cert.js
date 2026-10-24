// Самоподписанный сертификат для HTTPS на локальном компьютере (для защиты курсовой)
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

(async () => {
  const dir = path.join(__dirname, '..', 'certs');
  fs.mkdirSync(dir, { recursive: true });
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 825, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }]
  });
  fs.writeFileSync(path.join(dir, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(dir, 'cert.pem'), pems.cert);
  console.log('Сертификат создан в папке certs. Браузер предупредит, что он самоподписанный: это нормально для локального запуска.');
})();
