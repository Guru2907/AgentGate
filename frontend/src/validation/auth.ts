import { z } from 'zod'

export const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128, 'Password must be 128 characters or fewer.')

export const signupSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name must be 80 characters or fewer.'),
  email: z.email('Enter a valid email address.'),
  password: passwordSchema,
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  path: ['confirm_password'],
  message: 'Passwords do not match.',
})

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name must be 80 characters or fewer.'),
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password.'),
  new_password: passwordSchema,
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  path: ['confirm_password'],
  message: 'Passwords do not match.',
})

export const passwordResetSchema = z.object({
  new_password: passwordSchema,
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  path: ['confirm_password'],
  message: 'Passwords do not match.',
})

export const passwordResetRequestSchema = z.object({
  email: z.email('Enter a valid email address.'),
})
