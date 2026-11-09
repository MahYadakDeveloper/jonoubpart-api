export const PROBLEM_JSON = 'application/problem+json';

export const problemType = (code: string) =>
  `urn:problem:${code.toLowerCase().replace(/_/g, '-')}`;

export interface ProblemViolation {
  detail: string;
  pointer?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: ProblemViolation[];
  [extension: string]: unknown; // RFC 9457 §3.2
}
