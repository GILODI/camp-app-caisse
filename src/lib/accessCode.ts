// Alphabet sans caractères ambigus (0/O, 1/I) pour rester lisible quand on
// le communique à l'oral ou en photo à un vendeur.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateAccessCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase();
}
