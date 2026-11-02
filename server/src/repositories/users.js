export function createUserRepo(db) {
  const toUser = (row) => row && ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    authorId: row.author_id,
  });

  return {
    /** Includes password_hash - only used by the login flow. */
    findByEmailWithHash: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    findById: (id) => toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    listAdmins: () => db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY name").all().map(toUser),
    toUser,
  };
}
