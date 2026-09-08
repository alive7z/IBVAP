const toSafeUser = (user) => {
  if (!user) return null;
  return {
    publicId: user.public_id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.last_login_at || null,
    createdAt: user.created_at || null,
  };
};

module.exports = { toSafeUser };
