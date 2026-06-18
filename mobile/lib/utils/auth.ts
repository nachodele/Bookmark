export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number';
  }
  return null;
}

export function validateSignUp(
  email: string,
  emailConfirm: string,
  password: string,
  passwordConfirm: string,
): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedConfirm = emailConfirm.trim().toLowerCase();

  if (normalizedEmail !== normalizedConfirm) {
    return 'Email addresses do not match';
  }

  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;

  if (password !== passwordConfirm) {
    return 'Passwords do not match';
  }

  return null;
}

export function formatAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already exists') ||
    lower.includes('email already') ||
    lower.includes('already in use')
  ) {
    return 'Email already in use';
  }

  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password';
  }

  return message;
}
