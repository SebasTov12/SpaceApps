

const AIRBYTES_CONFIG = {
    // NASA TEMPO API Configuration
    nasa: {
        apiKey: '8VFqhy83c3Ji3gbebKoLe3DfMO4UkothFZJElztB', 
        baseUrl: 'https://api.nasa.gov/planetary/earth/assets',
        endpoints: {
            no2: '/tempo/no2',
            o3: '/tempo/o3',
            hcho: '/tempo/hcho'
        }
    },


    weather: {
        apiKey: '147e23d2ab0429fc6473a00033041c0d', 
        baseUrl: 'https://api.openweathermap.org/data/2.5',
        endpoints: {
            current: '/weather',
            forecast: '/forecast'
        }
    },

  
    airQuality: {
        apiKey: '147e23d2ab0429fc6473a00033041c0d', 
        baseUrl: 'https://api.openweathermap.org/data/2.5',
        endpoints: {
            current: '/weather',
            forecast: '/forecast'
        }
    },


    openaq: {
        baseUrl: 'https://api.openaq.org/v2',
        endpoints: {
            latest: '/latest'
        }
    },

    
    nasaFirms: {
        baseUrl: 'https://firms.modaps.eosdis.nasa.gov',
        endpoints: {
            global: '/mapserver/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=fires_viirs&outputFormat=application/json'
        }
    },

    // Application Settings
    app: {
        name: 'AirBytes',
        version: '1.0.0',
        updateInterval: 3600000, // 1 hour in milliseconds
        defaultLocation: 'colombia',
        useRealData: true 
    }
};


if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIRBYTES_CONFIG;
} else {
    window.AIRBYTES_CONFIG = AIRBYTES_CONFIG;
}

