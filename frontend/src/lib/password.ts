// Generated passwords: four groups of five, without characters that
// are easily mistaken for one another (0/O, 1/l/I).
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(groups = 4, size = 5): string {
  const values = new Uint32Array(groups * size);
  crypto.getRandomValues(values);
  const characters = Array.from(
    values,
    (value) => ALPHABET[value % ALPHABET.length],
  );

  return Array.from({ length: groups }, (_, index) =>
    characters.slice(index * size, (index + 1) * size).join(""),
  ).join("-");
}
