const MAX_RESUME_BYTES = 6 * 1024 * 1024;

export function validateResumeUpload({ name, size, mimeType }) {
  if (mimeType !== 'application/pdf') {
    return { ok: false, status: 415, reason: 'Only PDF resumes are supported.' };
  }
  if (!name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, status: 400, reason: 'Resume filename must end in .pdf.' };
  }
  if (size > MAX_RESUME_BYTES) {
    return { ok: false, status: 413, reason: 'Resume exceeds the upload limit.' };
  }
  return { ok: true, status: 200 };
}

export function recommendJobs(profile) {
  const skills = new Set((profile.skills ?? []).map((skill) => skill.toLowerCase()));
  const jobs = [
    { id: 'job-1', title: 'Full Stack Engineer', skills: ['typescript', 'node.js'] },
    { id: 'job-2', title: 'Frontend Engineer', skills: ['react', 'typescript'] },
  ];
  return jobs
    .map((job) => ({ ...job, score: job.skills.filter((skill) => skills.has(skill)).length }))
    .filter((job) => job.score > 0)
    .sort((left, right) => right.score - left.score);
}

export function captureAnalytics(eventName, properties = {}) {
  if (!eventName.trim()) throw new Error('eventName is required');
  return {
    accepted: true,
    event: eventName,
    properties,
    capturedAt: new Date().toISOString(),
  };
}
