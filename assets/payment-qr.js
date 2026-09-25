'use strict';
// Mock only: an unassigned, all-zero recipient. No real recipient or bank API.
// PromptPay EMV merchant-presented payload; QR encoder: qrcode-generator 1.4.4 (MIT).
const PaymentQR = {
  payload(amount) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid payment amount');
    const tag = (id, value) => id + String(value.length).padStart(2, '0') + value;
    const merchant = tag('00', 'A000000677010111') + tag('01', '0066000000000');
    const data = tag('00', '01') + tag('01', '12') + tag('29', merchant) + tag('58', 'TH') + tag('53', '764') + tag('54', amount.toFixed(2)) + '6304';
    let crc = 0xffff;
    for (const char of data) {
      crc ^= char.charCodeAt(0) << 8;
      for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
    }
    return data + crc.toString(16).toUpperCase().padStart(4, '0');
  },
  image(amount) {
    const qr = qrcode(0, 'M');
    qr.addData(this.payload(amount));
    qr.make();
    return qr.createDataURL(6, 24);
  }
};
