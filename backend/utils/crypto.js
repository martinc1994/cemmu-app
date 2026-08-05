/**
 * crypto.js — Utilidades de encriptación para evidencia digital
 * 
 * AES-256-CBC para encriptación at-rest de archivos.
 * SHA-256 para verificación de integridad.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Obtiene la clave de encriptación desde .env
 * Debe ser un string hex de 64 caracteres (32 bytes)
 */
function getEncryptionKey() {
  const keyHex = process.env.EVIDENCE_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('EVIDENCE_ENCRYPTION_KEY debe ser un string hex de 64 caracteres (32 bytes). Generá una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encripta un archivo y lo guarda en outputPath.
 * El IV (16 bytes) se prepende al archivo encriptado.
 * 
 * @param {string} inputPath  — ruta del archivo original
 * @param {string} outputPath — ruta donde guardar el archivo encriptado
 * @returns {Promise<void>}
 */
function encryptFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const key = getEncryptionKey();
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);

      // Escribir el IV al principio del archivo
      output.write(iv);

      input.pipe(cipher).pipe(output);

      output.on('finish', resolve);
      output.on('error', reject);
      input.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retorna un readable stream del archivo desencriptado.
 * Lee el IV de los primeros 16 bytes del archivo encriptado.
 * 
 * @param {string} encryptedPath — ruta del archivo encriptado
 * @returns {Promise<{stream: ReadableStream, cleanup: Function}>}
 */
function decryptFileStream(encryptedPath) {
  return new Promise((resolve, reject) => {
    try {
      const key = getEncryptionKey();

      // Leer los primeros 16 bytes (IV)
      const fd = fs.openSync(encryptedPath, 'r');
      const ivBuffer = Buffer.alloc(IV_LENGTH);
      fs.readSync(fd, ivBuffer, 0, IV_LENGTH, 0);
      fs.closeSync(fd);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      const input = fs.createReadStream(encryptedPath, { start: IV_LENGTH });
      const decryptedStream = input.pipe(decipher);

      resolve({
        stream: decryptedStream,
        cleanup: () => {
          input.destroy();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Calcula el SHA-256 de un archivo.
 * 
 * @param {string} filePath — ruta del archivo
 * @returns {Promise<string>} — hash hex
 */
function calculateSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Genera una clave de encriptación aleatoria (para uso inicial).
 * @returns {string} — 64 caracteres hex
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encryptFile,
  decryptFileStream,
  calculateSHA256,
  generateEncryptionKey
};
