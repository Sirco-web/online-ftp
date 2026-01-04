import crypto from 'crypto';

// Simple CSRF protection without deprecated csurf package
export function csrfProtection(req, res, next) {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate token if not exists
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    // Add token getter to response
    res.locals.csrfToken = req.session.csrfToken;
    return next();
  }
  
  // For mutations, validate token
  const token = req.headers['x-csrf-token'] || 
                req.body?._csrf || 
                req.query?._csrf;
  
  if (!token || token !== req.session.csrfToken) {
    const error = new Error('Invalid CSRF token');
    error.code = 'EBADCSRFTOKEN';
    error.statusCode = 403;
    return next(error);
  }
  
  next();
}

// Endpoint to get CSRF token
export function getCsrfToken(req, res) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.json({ csrfToken: req.session.csrfToken });
}
