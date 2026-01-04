const BASE_URL = '';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function handleResponse(response) {
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new ApiError(
      data.error || 'An error occurred',
      response.status,
      data
    );
  }
  
  return data;
}

export const api = {
  async get(url) {
    const response = await fetch(`${BASE_URL}${url}`, {
      credentials: 'include',
    });
    return handleResponse(response);
  },

  async post(url, body, csrfToken) {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  async put(url, body, csrfToken) {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  async delete(url, csrfToken) {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'DELETE',
      headers: {
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      },
      credentials: 'include',
    });
    return handleResponse(response);
  },
};

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function getFileIcon(mime, type) {
  if (type === 'folder') return 'folder';
  
  if (!mime) return 'file';
  
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('document')) return 'doc';
  if (mime.includes('sheet') || mime.includes('excel')) return 'sheet';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slides';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return 'archive';
  if (mime.includes('text') || mime.includes('json') || mime.includes('javascript')) return 'code';
  
  return 'file';
}
