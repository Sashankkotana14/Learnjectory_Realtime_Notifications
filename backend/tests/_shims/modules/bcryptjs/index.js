// TEST-ONLY placeholder: db.js requires bcryptjs at load time, but the unit tests never register/login (SEED_DEMO=false). NOT a real hash.
module.exports = { hashSync: () => { throw new Error('bcryptjs shim: not available in unit tests'); }, compareSync: () => false };
