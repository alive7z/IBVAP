const bcrypt = require("bcryptjs");

const HASH_ROUNDS = 12;

const hashPassword = async (password) => {
  return bcrypt.hash(password, HASH_ROUNDS);
};

const comparePassword = async (password, passwordHash) => {
  return bcrypt.compare(password, passwordHash);
};

module.exports = { hashPassword, comparePassword };
