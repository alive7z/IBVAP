const getActor = (req) => ({
  userId: req.user ? req.user.userId : null,
  publicId: req.user ? req.user.publicId : null,
  role: req.user ? req.user.role : null,
  ipAddress: req.ip,
});

module.exports = { getActor };
