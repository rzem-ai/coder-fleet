// Session handling for the sample service.
const SESSION_TTL_SECONDS = 8 * 60 * 60 // eight hours

function createSession(userId, now = Date.now()) {
  return { userId, createdAt: now, expiresAt: now + SESSION_TTL_SECONDS * 1000, revoked: false }
}

function isActive(session, now = Date.now()) {
  return !session.revoked && now < session.expiresAt
}

function revoke(session) {
  session.revoked = true
  return session
}

module.exports = { SESSION_TTL_SECONDS, createSession, isActive, revoke }
