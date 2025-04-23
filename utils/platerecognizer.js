const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

class PlateRecognizer {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.regions = options.regions || [];
    this.baseURL = 'https://api.platerecognizer.com/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });
  }

  /**
   * Set the API key
   * @param {string} apiKey - Your Plate Recognizer API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });
    return this;
  }

  /**
   * Set regions to match the license plate pattern of specific countries
   * @param {string|string[]} regions - Array of region codes or comma-separated string
   */
  setRegions(regions) {
    if (typeof regions === 'string') {
      this.regions = regions.split(',').map(r => r.trim());
    } else if (Array.isArray(regions)) {
      this.regions = regions;
    }
    return this;
  }

  /**
   * Read license plates from an image file
   * @param {Object} options - Options for plate recognition
   * @param {string} options.imagePath - Path to image file
   * @param {string} options.imageUrl - URL of image to process
   * @param {boolean} options.mmc - Predict vehicle make, model and color
   * @param {boolean} options.direction - Predict vehicle's direction of travel
   * @param {Object} options.config - Additional engine configuration
   * @param {string} options.cameraId - Unique camera identifier
   * @param {string} options.timestamp - ISO 8601 timestamp
   * @returns {Promise} - Recognition results
   */
  async recognizePlate(options = {}) {
    const formData = new FormData();
    
    // Handle regions
    if (this.regions.length > 0) {
      this.regions.forEach(region => {
        formData.append('regions', region);
      });
    }
    
    // Handle file upload
    if (options.imagePath) {
      formData.append('upload', fs.createReadStream(options.imagePath));
    } else if (options.imageUrl) {
      formData.append('upload_url', options.imageUrl);
    } else {
      throw new Error('Either imagePath or imageUrl must be provided');
    }
    
    // Handle optional parameters
    if (options.mmc) {
      formData.append('mmc', options.mmc.toString());
    }
    
    if (options.direction) {
      formData.append('direction', options.direction.toString());
    }
    
    if (options.config) {
      formData.append('config', JSON.stringify(options.config));
    }
    
    if (options.cameraId) {
      formData.append('camera_id', options.cameraId);
    }
    
    if (options.timestamp) {
      formData.append('timestamp', options.timestamp);
    }
    
    try {
      const response = await this.client.post('/plate-reader/', formData, {
        headers: {
          ...formData.getHeaders()
        }
      });
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }
  
  /**
   * Get statistics about API usage
   * @returns {Promise} - Statistics data
   */
  async getStatistics() {
    try {
      const response = await this.client.get('/statistics/');
      return response.data;
    } catch (error) {
      this._handleError(error);
    }
  }
  
  /**
   * Handle API errors
   * @private
   */
  _handleError(error) {
    if (error.response) {
      const { status } = error.response;
      
      if (status === 403) {
        throw new Error('Forbidden: insufficient credits or invalid API key');
      } else if (status === 413) {
        throw new Error('Payload Too Large: image exceeds size limits');
      } else if (status === 429) {
        throw new Error('Too Many Requests: rate limit exceeded');
      }
      
      throw new Error(`Request failed with status code ${status}`);
    }
    
    throw error;
  }
}

module.exports = PlateRecognizer;
