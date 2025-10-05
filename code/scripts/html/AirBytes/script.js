class AirBytesApp {
    constructor() {
        // Load configuration from config.js
        this.config = window.AIRBYTES_CONFIG || {};
        
        this.nasaApiKey = this.config.nasa?.apiKey || '8VFqhy83c3Ji3gbebKoLe3DfMO4UkothFZJElztB';
        this.tempoBaseUrl = this.config.nasa?.baseUrl || 'https://api.nasa.gov/planetary/earth/assets';
        this.tempoEndpoints = {
            no2: `${this.tempoBaseUrl}`,
            o3: `${this.tempoBaseUrl}`,
            hcho: `${this.tempoBaseUrl}`
        };
        
        this.weatherApiKey = this.config.weather?.apiKey || '147e23d2ab0429fc6473a00033041c0d';
        this.weatherBaseUrl = this.config.weather?.baseUrl || 'https://api.openweathermap.org/data/2.5';
        
        this.airQualityApiKey = this.config.airQuality?.apiKey || '147e23d2ab0429fc6473a00033041c0d';
        this.airQualityBaseUrl = this.config.airQuality?.baseUrl || 'https://api.openweathermap.org/data/2.5';
        
        // Use real data setting from config
        this.useRealData = this.config.app?.useRealData !== false;
        
        // Debug logging
        console.log('AirBytes Configuration Loaded:');
        console.log('- Use Real Data:', this.useRealData);
        console.log('- Weather API Key:', this.weatherApiKey);
        console.log('- Air Quality API Key:', this.airQualityApiKey);
        console.log('- Config Object:', this.config);
        
        this.currentLocation = 'colombia';
        this.updateInterval = 600000; // 10 minutes
        this.agriculturalUpdateInterval = 900000; // 15 minutes for agricultural data
        this.notificationCheckInterval = 300000; // 5 minutes for notification checks
        this.isLoading = false;
        this.useRealData = true;
        
        this.map = null;
        this.pollutionMarkers = [];
        this.mapUpdateInterval = null;
        
        this.dataCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes cache
        this.isMapLoaded = false;
        this.currentUserLocation = null;
        this.isUsingCurrentLocation = false;
        
        this.currentSection = 'today';
        
        // Notification settings
        this.notificationPermission = 'default';
        this.pushSubscription = null;
        this.notificationSettings = {
            enabled: false,
            aqiThreshold: 100,
            respiratoryAlerts: true,
            cardiacAlerts: true,
            pediatricAlerts: true,
            elderlyAlerts: true,
            weatherAlerts: true
        };
        
        this.northAmericanRegions = {
            'north-america': { name: 'Norteamérica', lat: 45.0, lon: -100.0, elevation: 500, useTempo: true },
            'usa': { name: 'Estados Unidos', lat: 39.8283, lon: -98.5795, elevation: 500, useTempo: true },
            'canada': { name: 'Canadá', lat: 56.1304, lon: -106.3468, elevation: 500, useTempo: true },
            'mexico': { name: 'México', lat: 23.6345, lon: -102.5528, elevation: 500, useTempo: true }
        };
        this.colombianCities = {
            'colombia': { name: 'Colombia', lat: 4.5709, lon: -74.2973, elevation: 2640, useTempo: false },
            'bogota': { name: 'Bogotá', lat: 4.7110, lon: -74.0721, elevation: 2640, useTempo: false },
            'medellin': { name: 'Medellín', lat: 6.2442, lon: -75.5812, elevation: 1495, useTempo: false },
            'cali': { name: 'Cali', lat: 3.4516, lon: -76.5320, elevation: 1000, useTempo: false },
            'barranquilla': { name: 'Barranquilla', lat: 10.9639, lon: -74.7964, elevation: 18, useTempo: false },
            'cartagena': { name: 'Cartagena', lat: 10.3910, lon: -75.4794, elevation: 2, useTempo: false },
            'bucaramanga': { name: 'Bucaramanga', lat: 7.1193, lon: -73.1227, elevation: 959, useTempo: false },
            'pereira': { name: 'Pereira', lat: 4.8133, lon: -75.6961, elevation: 1411, useTempo: false },
            'santa-marta': { name: 'Santa Marta', lat: 11.2408, lon: -74.2110, elevation: 6, useTempo: false },
            'ibague': { name: 'Ibagué', lat: 4.4378, lon: -75.2006, elevation: 1285, useTempo: false },
            'manizales': { name: 'Manizales', lat: 5.0689, lon: -75.5174, elevation: 2160, useTempo: false },
            'neiva': { name: 'Neiva', lat: 2.9345, lon: -75.2809, elevation: 442, useTempo: false }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
        this.startAutoUpdate();
        this.startAgriculturalAutoUpdate();
        
        setTimeout(() => {
            this.initializeMap();
        }, 1000);
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        document.getElementById('locationSelect').addEventListener('change', (e) => {
            this.currentLocation = e.target.value;
            this.loadLocationData();
        });

        document.getElementById('currentLocationBtn').addEventListener('click', () => {
            this.getCurrentLocation();
        });

        document.getElementById('resetLocationBtn').addEventListener('click', () => {
            this.resetToDefaultLocation();
        });


        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.target.closest('.nav-btn').dataset.section;
                this.showSection(section);
            });
        });

        document.getElementById('predictBtn').addEventListener('click', () => {
            this.generateAdvancedPrediction();
        });

        this.addRealDataToggle();

        document.getElementById('refreshMapBtn').addEventListener('click', () => {
            this.refreshMapData();
        });
        
        // Debug: Check all sections are available
        this.debugSections();
        
        // Initialize navigation scroll functionality
        this.initializeNavigationScroll();


        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('notification-close')) {
                e.target.closest('.notification').remove();
            }
        });
    }

    async loadInitialData() {
        try {
            const [tempoData, groundData, weatherData] = await Promise.all([
                this.loadTempoData(),
                this.loadGroundData(),
                this.loadWeatherData()
            ]);
            
            
            this.updateDisplayData(tempoData, groundData, weatherData);
            
            
            const aqi = this.calculateAQI(tempoData, groundData);
            this.updateAQIDisplay(aqi);
            
            await Promise.all([
                this.loadForecast(),
                this.checkAlerts()
            ]);
            
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Error al cargar los datos', 'error');
        }
    }

    async loadLocationData() {
        
        const locationData = this.getCurrentLocationData();
        
        try {
            
            const [tempoData, groundData, weatherData] = await Promise.all([
                this.loadTempoDataForLocation(locationData),
                this.loadGroundDataForLocation(locationData),
                this.loadWeatherDataForLocation(locationData)
            ]);
            
            
            this.updateDisplayData(tempoData, groundData, weatherData);
            
            
            const aqi = this.calculateAQI(tempoData, groundData);
            this.updateAQIDisplay(aqi);
            
            
            if (this.isMapLoaded) {
                this.focusMapOnLocation(locationData);
            }
            
            this.updateLastUpdateTime();
            
        } catch (error) {
            console.error('Error loading location data:', error);
            this.showNotification('Error al cargar datos de la ubicación', 'error');
        }
    }

    updateDisplayData(tempoData, groundData, weatherData) {
        
        document.getElementById('tempoNo2').textContent = `${tempoData.no2} ppb`;
        document.getElementById('tempoO3').textContent = `${tempoData.o3} ppb`;
        document.getElementById('tempoHcho').textContent = `${tempoData.hcho} ppb`;
        
        
        document.getElementById('groundPm25').textContent = `${groundData.pm25} μg/m³`;
        document.getElementById('groundPm10').textContent = `${groundData.pm10} μg/m³`;
        document.getElementById('groundCo').textContent = `${groundData.co} ppm`;
        
        
        document.getElementById('weatherTemp').textContent = `${weatherData.temperature}°C`;
        document.getElementById('weatherHumidity').textContent = `${weatherData.humidity}%`;
        document.getElementById('weatherWind').textContent = `${weatherData.windSpeed} km/h`;
    }

    


    async loadForecast() {
        const forecastData = this.generateForecastData();
        const forecastContainer = document.getElementById('forecastTimeline');
        
        forecastContainer.innerHTML = '';
        
        forecastData.forEach(forecast => {
            const forecastCard = document.createElement('div');
            forecastCard.className = 'forecast-card';
            forecastCard.innerHTML = `
                <div class="forecast-time">${forecast.time}</div>
                <div class="forecast-aqi" style="color: ${this.getAQIColor(forecast.aqi)}">${forecast.aqi}</div>
                <div class="forecast-status">${forecast.status}</div>
            `;
            forecastContainer.appendChild(forecastCard);
        });
    }

    async checkAlerts() {
        const alerts = this.generateAlerts();
        const alertsContainer = document.getElementById('alertsContainer');
        
        alertsContainer.innerHTML = '';
        
        if (alerts.length === 0) {
            alertsContainer.innerHTML = '<p style="text-align: center; color: #666;">No hay alertas activas</p>';
            return;
        }
        
        alerts.forEach(alert => {
            const alertCard = document.createElement('div');
            alertCard.className = `alert-card ${alert.type}`;
            alertCard.innerHTML = `
                <div class="alert-icon">
                    <i class="fas ${this.getAlertIcon(alert.type)}"></i>
                </div>
                <div class="alert-content">
                    <h4>${alert.title}</h4>
                    <p>${alert.message}</p>
                </div>
            `;
            alertsContainer.appendChild(alertCard);
        });
    }

    calculateAQI(tempoData, groundData) {
  
        const pm25AQI = this.calculatePollutantAQI(groundData.pm25, 'pm25');
        const pm10AQI = this.calculatePollutantAQI(groundData.pm10, 'pm10');
        const o3AQI = this.calculatePollutantAQI(tempoData.o3, 'o3');
        const no2AQI = this.calculatePollutantAQI(tempoData.no2, 'no2');
        
      
        return Math.max(pm25AQI, pm10AQI, o3AQI, no2AQI);
    }

    calculatePollutantAQI(concentration, pollutant) {
       
        const breakpoints = {
            pm25: [0, 12, 35.4, 55.4, 150.4, 250.4, 350.4, 500.4],
            pm10: [0, 54, 154, 254, 354, 424, 504, 604],
            o3: [0, 54, 70, 85, 105, 200, 300, 400],
            no2: [0, 53, 100, 360, 649, 1249, 1649, 2049]
        };
        
        const aqiRanges = [0, 50, 100, 150, 200, 300, 400, 500];
        
        for (let i = 0; i < breakpoints[pollutant].length - 1; i++) {
            if (concentration >= breakpoints[pollutant][i] && concentration <= breakpoints[pollutant][i + 1]) {
                const aqi = ((aqiRanges[i + 1] - aqiRanges[i]) / (breakpoints[pollutant][i + 1] - breakpoints[pollutant][i])) * 
                           (concentration - breakpoints[pollutant][i]) + aqiRanges[i];
                return Math.round(aqi);
            }
        }
        
        return 500; 
    }

    updateAQIDisplay(aqi) {
        const aqiCircle = document.getElementById('aqiCircle');
        const aqiValue = document.getElementById('aqiValue');
        const aqiStatus = document.getElementById('aqiStatus');
        const aqiDescription = document.getElementById('aqiDescription');
        const healthRecommendations = document.getElementById('healthRecommendations');
        
        aqiValue.textContent = aqi;
        
        const aqiInfo = this.getAQIInfo(aqi);
        
     
        aqiCircle.className = `aqi-circle ${aqiInfo.category}`;
        
      
        aqiStatus.textContent = aqiInfo.status;
        aqiDescription.textContent = aqiInfo.description;
        
   
        healthRecommendations.innerHTML = `
            <h4>Recomendaciones de Salud</h4>
            <ul>
                ${aqiInfo.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        `;
        
        // Actualizar recomendaciones personalizadas si la guía de usuario está activa
        if (this.currentSection === 'user-guide') {
            this.updatePersonalizedRecommendations();
        }
    }

    getAQIInfo(aqi) {
        if (aqi <= 50) {
            return {
                category: 'good',
                status: 'Buena',
                description: 'La calidad del aire es satisfactoria y la contaminación del aire presenta poco o ningún riesgo.',
                recommendations: [
                    'Disfruta de actividades al aire libre',
                    'Ideal para ejercicio al aire libre',
                    'Ventila tu hogar normalmente'
                ]
            };
        } else if (aqi <= 100) {
            return {
                category: 'moderate',
                status: 'Moderada',
                description: 'La calidad del aire es aceptable. Sin embargo, puede haber un riesgo moderado para algunas personas.',
                recommendations: [
                    'Personas sensibles deben considerar reducir actividades al aire libre',
                    'Evita ejercicio intenso al aire libre si tienes problemas respiratorios',
                    'Mantén las ventanas cerradas si tienes alergias'
                ]
            };
        } else if (aqi <= 150) {
            return {
                category: 'unhealthy-sensitive',
                status: 'Insalubre para Grupos Sensibles',
                description: 'Los miembros de grupos sensibles pueden experimentar efectos en la salud.',
                recommendations: [
                    'Grupos sensibles deben evitar actividades al aire libre',
                    'Niños y adultos mayores deben permanecer en interiores',
                    'Usa mascarilla si debes salir al exterior'
                ]
            };
        } else if (aqi <= 200) {
            return {
                category: 'unhealthy',
                status: 'Insalubre',
                description: 'Algunos miembros del público en general pueden experimentar efectos en la salud.',
                recommendations: [
                    'Evita actividades al aire libre',
                    'Mantén las ventanas cerradas',
                    'Usa purificadores de aire en interiores'
                ]
            };
        } else if (aqi <= 300) {
            return {
                category: 'very-unhealthy',
                status: 'Muy Insalubre',
                description: 'Advertencia de salud: todos pueden experimentar efectos más graves en la salud.',
                recommendations: [
                    'Permanecer en interiores con ventanas cerradas',
                    'Evitar cualquier actividad al aire libre',
                    'Usar purificadores de aire de alta eficiencia'
                ]
            };
        } else {
            return {
                category: 'hazardous',
                status: 'Peligroso',
                description: 'Alerta de salud: todos pueden experimentar efectos graves en la salud.',
                recommendations: [
                    'Permanecer en interiores con todas las ventanas cerradas',
                    'Evitar cualquier actividad al aire libre',
                    'Considerar evacuar el área si es posible'
                ]
            };
        }
    }

    getAQIColor(aqi) {
        if (aqi <= 50) return '#4CAF50';
        if (aqi <= 100) return '#FFEB3B';
        if (aqi <= 150) return '#FF9800';
        if (aqi <= 200) return '#F44336';
        if (aqi <= 300) return '#9C27B0';
        return '#795548';
    }

    getAlertIcon(type) {
        const icons = {
            warning: 'fa-exclamation-triangle',
            danger: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-info-circle';
    }

    async loadTempoData() {
        const locationData = this.getCurrentLocationData();
        const cacheKey = `tempo_${locationData.lat}_${locationData.lon}`;
        
        if (this.useRealData) {
            
            try {
                const data = await this.fetchRealTempoData();
                this.setCachedData(cacheKey, data);
                return data;
            } catch (error) {
                console.error('Error fetching real TEMPO data:', error);
                
                const cachedData = this.getCachedData(cacheKey);
                if (cachedData) {
                    console.log('Using cached TEMPO data due to API error');
                    return cachedData;
                }
                
                try {
                    const data = await this.fetchAlternativeTempoData(locationData);
                    this.setCachedData(cacheKey, data);
                    return data;
                } catch (altError) {
                    console.error('Error fetching alternative TEMPO data:', altError);
                    this.showNotification('Error al obtener datos TEMPO, usando datos simulados', 'warning');
            return this.generateSimulatedTempoData();
                }
            }
        } else {
            
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            const data = this.generateSimulatedTempoData();
            this.setCachedData(cacheKey, data);
            return data;
        }
    }

    getCurrentLocationData() {
        
        if (this.isUsingCurrentLocation && this.currentUserLocation) {
            return this.currentUserLocation;
        }
        
        
        if (this.northAmericanRegions[this.currentLocation]) {
            return this.northAmericanRegions[this.currentLocation];
        }
        
        return this.colombianCities[this.currentLocation];
    }

    getLocationDataByKey(locationKey) {
        if (this.northAmericanRegions[locationKey]) {
            return this.northAmericanRegions[locationKey];
        }
        
        if (this.colombianCities[locationKey]) {
            return this.colombianCities[locationKey];
        }
        
        console.warn(`Ubicación no encontrada: ${locationKey}, usando Colombia por defecto`);
        return this.colombianCities['colombia'];
    }

    async getWeatherDataForLocation(locationData) {
        try {
            const response = await fetch(`${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric&lang=es`);
            const data = await response.json();
            
            if (data.cod === 200) {
                return {
                    temperature: Math.round(data.main.temp),
                    humidity: data.main.humidity,
                    pressure: data.main.pressure,
                    windSpeed: Math.round(data.wind.speed * 3.6),
                    windDirection: this.getWindDirection(data.wind.deg),
                    precipitation: data.rain ? (data.rain['1h'] || 0) : 0,
                    description: data.weather[0].description,
                    icon: data.weather[0].icon,
                    visibility: data.visibility / 1000,
                    uvIndex: data.uvi || 0,
                    cloudiness: data.clouds.all,
                    timestamp: new Date().toISOString(),
                    source: 'OpenWeatherMap'
                };
            } else {
                throw new Error('Error en la respuesta de la API');
            }
        } catch (error) {
            console.error('Error fetching weather data for location:', error);
            // Fallback to simulated data
            return this.generateSimulatedWeatherData(locationData);
        }
    }

    generateSimulatedWeatherData(locationData) {
        const baseTemp = 25 - (locationData.elevation / 100) * 0.6;
        const variation = 5;
        const temp = baseTemp + (Math.random() - 0.5) * variation;
        
        return {
            temperature: Math.round(temp),
            humidity: Math.round(60 + Math.random() * 30),
            pressure: Math.round(1013 + (Math.random() - 0.5) * 20),
            windSpeed: Math.round(Math.random() * 20),
            windDirection: this.getWindDirection(Math.random() * 360),
            precipitation: Math.round(Math.random() * 10),
            description: 'Parcialmente nublado',
            icon: '02d',
            visibility: 10,
            uvIndex: Math.round(Math.random() * 8),
            cloudiness: Math.round(Math.random() * 100),
            timestamp: new Date().toISOString(),
            source: 'Simulated Data'
        };
    }

    getCropSpecificRecommendations(cropType, cropStage, weatherData, soilData, locationData) {
        const recommendations = {
            planting: [],
            irrigation: [],
            protection: [],
            farming: []
        };

        const cropName = this.getCropDisplayName(cropType);

        // Quick temperature check
        if (weatherData.temperature < 10) {
            recommendations.planting.push(`❄️ Temperatura baja para ${cropName}. Protege del frío.`);
        } else if (weatherData.temperature > 30) {
            recommendations.planting.push(`🌡️ Temperatura alta para ${cropName}. Riega más frecuentemente.`);
        } else {
            recommendations.planting.push(`✅ Temperatura adecuada para ${cropName}.`);
        }

        // Quick soil moisture check
        if (soilData.moisture < 30) {
            recommendations.irrigation.push(`💧 ${cropName} necesita riego urgente.`);
        } else if (soilData.moisture > 80) {
            recommendations.irrigation.push(`🌊 Reducir riego para ${cropName}.`);
        } else {
            recommendations.irrigation.push(`✅ Humedad adecuada para ${cropName}.`);
        }

        // Quick protection checks
        if (weatherData.temperature < 5) {
            recommendations.protection.push(`❄️ Protege ${cropName} de heladas.`);
        }
        if (weatherData.windSpeed > 30) {
            recommendations.protection.push(`💨 Protege ${cropName} del viento.`);
        }

        // Quick location-based recommendations
        if (locationData.elevation > 2000) {
            recommendations.farming.push(`🏔️ ${cropName} en zona alta.`);
        } else if (locationData.elevation < 500) {
            recommendations.farming.push(`🌊 ${cropName} en zona baja.`);
        }

        return recommendations;
    }

    getCropDisplayName(cropType) {
        const cropNames = {
            'general': 'cultivo general',
            'maiz': 'maíz',
            'arroz': 'arroz',
            'cafe': 'café',
            'papa': 'papa',
            'tomate': 'tomate',
            'lechuga': 'lechuga',
            'frijol': 'frijol',
            'trigo': 'trigo',
            'soya': 'soya'
        };
        return cropNames[cropType] || 'cultivo';
    }

    async getCurrentLocation() {
        const locationBtn = document.getElementById('currentLocationBtn');
        const originalText = locationBtn.innerHTML;
        
        
        locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Obteniendo ubicación...</span>';
        locationBtn.disabled = true;

        try {
            
            if (!navigator.geolocation) {
                throw new Error('Geolocalización no soportada por este navegador');
            }

            
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 
                });
            });

            const { latitude, longitude } = position.coords;
            
            
            this.currentUserLocation = {
                name: 'Mi Ubicación',
                lat: latitude,
                lon: longitude,
                elevation: 0, 
                useTempo: this.isLocationInNorthAmerica(latitude, longitude)
            };

            
            this.isUsingCurrentLocation = true;
            this.updateLocationDisplay();
            
            
            await this.loadLocationData();
            
            this.showNotification('Ubicación obtenida exitosamente', 'success');

        } catch (error) {
            console.error('Error obteniendo ubicación:', error);
            
            let errorMessage = 'Error obteniendo ubicación';
            if (error.code === 1) {
                errorMessage = 'Permiso denegado para acceder a la ubicación';
            } else if (error.code === 2) {
                errorMessage = 'Ubicación no disponible';
            } else if (error.code === 3) {
                errorMessage = 'Tiempo de espera agotado';
            }
            
            this.showNotification(errorMessage, 'error');
            this.isUsingCurrentLocation = false;
            this.currentUserLocation = null;
        } finally {
            
            locationBtn.innerHTML = originalText;
            locationBtn.disabled = false;
        }
    }

    isLocationInNorthAmerica(lat, lon) {
        
        
        
        return lat >= 15 && lat <= 85 && lon >= -180 && lon <= -50;
    }

    updateLocationDisplay() {
        const locationSelect = document.getElementById('locationSelect');
        const locationBtn = document.getElementById('currentLocationBtn');
        const resetBtn = document.getElementById('resetLocationBtn');
        
        if (this.isUsingCurrentLocation) {
            
            locationBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i><span>Ubicación Actual</span>';
            locationBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
            
            
            resetBtn.style.display = 'flex';
            
            
            locationSelect.disabled = true;
            locationSelect.style.opacity = '0.6';
        } else {
            
            locationBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i><span>Mi Ubicación</span>';
            locationBtn.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
            
            
            resetBtn.style.display = 'none';
            
            
            locationSelect.disabled = false;
            locationSelect.style.opacity = '1';
        }
    }

    resetToDefaultLocation() {
        this.isUsingCurrentLocation = false;
        this.currentUserLocation = null;
        this.currentLocation = 'colombia'; 
        document.getElementById('locationSelect').value = 'colombia';
        this.updateLocationDisplay();
        this.loadLocationData();
    }

    

    showSection(sectionName) {
        console.log('🔄 Switching to section:', sectionName);
        
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        // Remove active class from all nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
            console.log('✅ Section activated:', sectionName);
        } else {
            console.error('❌ Section not found:', sectionName);
        }
        
        // Activate corresponding nav button
        const activeButton = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
            console.log('✅ Nav button activated:', sectionName);
        } else {
            console.error('❌ Nav button not found:', sectionName);
        }
        
        // Auto-scroll to center the active button
        this.scrollToActiveNavButton(activeButton);

        this.currentSection = sectionName;

        // Load section data
        this.loadSectionData(sectionName);
    }
    
    debugSections() {
        const sections = ['today', 'hourly', 'daily', 'monthly', 'air-quality', 'user-guide', 'farmers', 'health'];
        console.log('🔍 Debugging sections availability:');
        
        sections.forEach(section => {
            const sectionElement = document.getElementById(`${section}-section`);
            const navButton = document.querySelector(`[data-section="${section}"]`);
            
            console.log(`📋 ${section}:`, {
                sectionElement: sectionElement ? '✅ Found' : '❌ Missing',
                navButton: navButton ? '✅ Found' : '❌ Missing',
                sectionId: `${section}-section`,
                dataSection: section
            });
        });
    }
    
    initializeNavigationScroll() {
        const navigation = document.querySelector('.main-navigation');
        if (!navigation) return;
        
        console.log('🔄 Initializing navigation scroll functionality');
        
        // Force scroll properties for mobile
        navigation.style.overflowX = 'auto';
        navigation.style.overflowY = 'hidden';
        navigation.style.webkitOverflowScrolling = 'touch';
        navigation.style.scrollBehavior = 'smooth';
        navigation.style.touchAction = 'pan-x';
        navigation.style.overscrollBehaviorX = 'contain';
        
        // Ensure nav-container has proper flex properties
        const navContainer = navigation.querySelector('.nav-container');
        if (navContainer) {
            navContainer.style.display = 'flex';
            navContainer.style.flexWrap = 'nowrap';
            navContainer.style.minWidth = 'max-content';
            navContainer.style.width = 'max-content';
        }
        
        // Ensure all nav buttons are properly configured
        const navButtons = navigation.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.style.flexShrink = '0';
            btn.style.whiteSpace = 'nowrap';
        });
        
        // Add scroll event listener
        navigation.addEventListener('scroll', () => {
            this.updateScrollIndicators(navigation);
        });
        
        // Add touch event listeners for better mobile experience
        navigation.addEventListener('touchstart', (e) => {
            this.handleTouchStart(e, navigation);
        });
        
        navigation.addEventListener('touchmove', (e) => {
            this.handleTouchMove(e, navigation);
        });
        
        navigation.addEventListener('touchend', (e) => {
            this.handleTouchEnd(e, navigation);
        });
        
        // Initial update of scroll indicators
        this.updateScrollIndicators(navigation);
        
        // Force a reflow to ensure styles are applied
        navigation.offsetHeight;
        
        console.log('✅ Navigation scroll initialized with forced properties');
        
        // Verify all sections are accessible
        this.verifyMobileNavigation();
    }
    
    verifyMobileNavigation() {
        const navigation = document.querySelector('.main-navigation');
        const navContainer = navigation?.querySelector('.nav-container');
        const navButtons = navigation?.querySelectorAll('.nav-btn');
        
        console.log('📱 Mobile navigation verification:');
        console.log('Navigation element:', navigation ? '✅ Found' : '❌ Missing');
        console.log('Nav container:', navContainer ? '✅ Found' : '❌ Missing');
        console.log('Nav buttons count:', navButtons?.length || 0);
        
        if (navContainer) {
            console.log('Container styles:', {
                display: getComputedStyle(navContainer).display,
                flexWrap: getComputedStyle(navContainer).flexWrap,
                minWidth: getComputedStyle(navContainer).minWidth,
                width: getComputedStyle(navContainer).width
            });
        }
        
        if (navigation) {
            console.log('Navigation styles:', {
                overflowX: getComputedStyle(navigation).overflowX,
                overflowY: getComputedStyle(navigation).overflowY,
                webkitOverflowScrolling: getComputedStyle(navigation).webkitOverflowScrolling,
                scrollBehavior: getComputedStyle(navigation).scrollBehavior
            });
        }
        
        // Test scroll functionality
        if (navigation && navButtons.length > 4) {
            console.log('🧪 Testing scroll functionality...');
            const lastButton = navButtons[navButtons.length - 1];
            const scrollLeft = lastButton.offsetLeft - navigation.clientWidth / 2;
            
            navigation.scrollTo({
                left: scrollLeft,
                behavior: 'smooth'
            });
            
            setTimeout(() => {
                console.log('📊 Scroll test result:', {
                    scrollLeft: navigation.scrollLeft,
                    maxScroll: navigation.scrollWidth - navigation.clientWidth,
                    canScroll: navigation.scrollWidth > navigation.clientWidth
                });
            }, 500);
        }
    }
    
    updateScrollIndicators(navigation) {
        const scrollLeft = navigation.scrollLeft;
        const scrollWidth = navigation.scrollWidth;
        const clientWidth = navigation.clientWidth;
        const maxScroll = scrollWidth - clientWidth;
        
        // Remove existing classes
        navigation.classList.remove('scroll-start', 'scroll-end');
        
        // Add appropriate classes based on scroll position
        if (scrollLeft <= 5) {
            navigation.classList.add('scroll-start');
        }
        
        if (scrollLeft >= maxScroll - 5) {
            navigation.classList.add('scroll-end');
        }
        
        console.log('📊 Scroll indicators updated:', {
            scrollLeft: scrollLeft,
            maxScroll: maxScroll,
            isAtStart: scrollLeft <= 5,
            isAtEnd: scrollLeft >= maxScroll - 5
        });
    }
    
    handleTouchStart(e, navigation) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartScrollLeft = navigation.scrollLeft;
        navigation.style.scrollBehavior = 'auto';
    }
    
    handleTouchMove(e, navigation) {
        if (!this.touchStartX) return;
        
        const touchCurrentX = e.touches[0].clientX;
        const touchDiff = this.touchStartX - touchCurrentX;
        const newScrollLeft = this.touchStartScrollLeft + touchDiff;
        
        // Prevent default to allow custom scroll behavior
        e.preventDefault();
        
        // Apply scroll with momentum
        navigation.scrollLeft = newScrollLeft;
    }
    
    handleTouchEnd(e, navigation) {
        if (!this.touchStartX) return;
        
        // Re-enable smooth scrolling
        navigation.style.scrollBehavior = 'smooth';
        
        // Update scroll indicators
        this.updateScrollIndicators(navigation);
        
        // Reset touch variables
        this.touchStartX = null;
        this.touchStartScrollLeft = null;
    }
    
    scrollToActiveNavButton(activeButton) {
        const navigation = document.querySelector('.main-navigation');
        if (!navigation || !activeButton) return;
        
        console.log('🎯 Scrolling to active button:', activeButton);
        
        // Wait for next frame to ensure layout is complete
        requestAnimationFrame(() => {
            const containerRect = navigation.getBoundingClientRect();
            const buttonRect = activeButton.getBoundingClientRect();
            const containerCenter = containerRect.left + containerRect.width / 2;
            const buttonCenter = buttonRect.left + buttonRect.width / 2;
            
            // Calculate scroll position to center the button
            const scrollLeft = navigation.scrollLeft + (buttonCenter - containerCenter);
            
            console.log('📊 Scroll calculation:', {
                containerCenter: containerCenter,
                buttonCenter: buttonCenter,
                currentScrollLeft: navigation.scrollLeft,
                targetScrollLeft: scrollLeft,
                scrollDiff: buttonCenter - containerCenter
            });
            
            // Smooth scroll to center the active button
            navigation.scrollTo({
                left: scrollLeft,
                behavior: 'smooth'
            });
            
            // Update scroll indicators after scroll
            setTimeout(() => {
                this.updateScrollIndicators(navigation);
            }, 300);
        });
    }

    loadSectionData(sectionName) {
        switch(sectionName) {
            case 'hourly':
                this.loadHourlyData();
                break;
            case 'daily':
                this.loadDailyData();
                break;
            case 'monthly':
                this.loadMonthlyData();
                break;
            case 'air-quality':
                this.loadAirQualityDetails();
                break;
            case 'user-guide':
                this.loadUserGuideData();
                break;
            case 'farmers':
                this.loadFarmersData();
                break;
            case 'health':
                this.loadHealthData();
                break;
        }
    }


    updateTemperatureDisplay() {
        
        const tempElements = document.querySelectorAll('.temp-display');
        tempElements.forEach(element => {
            const celsius = parseFloat(element.dataset.celsius);
            if (!isNaN(celsius)) {
                const displayTemp = this.temperatureUnit === 'fahrenheit' 
                    ? Math.round((celsius * 9/5) + 32) 
                    : Math.round(celsius);
                element.textContent = `${displayTemp}°${this.temperatureUnit === 'fahrenheit' ? 'F' : 'C'}`;
            }
        });
    }

    loadHourlyData() {
        const container = document.getElementById('hourlyForecast');
        
        const hourlyData = this.generateHourlyData();
        
        container.innerHTML = hourlyData.map(hour => `
            <div class="hourly-card">
                <div class="hourly-time">${hour.time}</div>
                <div class="hourly-temp temp-display" data-celsius="${hour.temp}">${hour.temp}°C</div>
                <div class="hourly-aqi">AQI: ${hour.aqi}</div>
                <div class="hourly-wind">Viento: ${hour.wind} km/h</div>
            </div>
        `).join('');
        
        this.updateTemperatureDisplay();
    }

    loadDailyData() {
        const container = document.getElementById('dailyForecast');
        const dailyData = this.generateDailyData();
        
        container.innerHTML = dailyData.map(day => `
            <div class="daily-card">
                <div class="daily-date">${day.date}</div>
                <div class="daily-summary">
                    <div class="daily-item">
                        <div class="daily-item-label">Temp. Máx</div>
                        <div class="daily-item-value temp-display" data-celsius="${day.maxTemp}">${day.maxTemp}°C</div>
                    </div>
                    <div class="daily-item">
                        <div class="daily-item-label">Temp. Mín</div>
                        <div class="daily-item-value temp-display" data-celsius="${day.minTemp}">${day.minTemp}°C</div>
                    </div>
                    <div class="daily-item">
                        <div class="daily-item-label">AQI Promedio</div>
                        <div class="daily-item-value">${day.avgAqi}</div>
                    </div>
                    <div class="daily-item">
                        <div class="daily-item-label">Viento</div>
                        <div class="daily-item-value">${day.wind} km/h</div>
                    </div>
                </div>
            </div>
        `).join('');
        
        this.updateTemperatureDisplay();
    }


    loadMonthlyData() {
        const container = document.getElementById('monthlyAnalysis');
        const monthlyData = this.generateMonthlyData();
        
        container.innerHTML = monthlyData.map(month => `
            <div class="monthly-card">
                <div class="monthly-title">${month.month}</div>
                <div class="monthly-stats">
                    <div class="stat-item">
                        <div class="stat-value">${month.avgAqi}</div>
                        <div class="stat-label">AQI Promedio</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${month.goodDays}</div>
                        <div class="stat-label">Días Buenos</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${month.unhealthyDays}</div>
                        <div class="stat-label">Días Insalubres</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${month.avgTemp}°C</div>
                        <div class="stat-label">Temp. Promedio</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    loadAirQualityDetails() {
        const container = document.getElementById('airQualityDetails');
        const pollutants = [
            { name: 'PM2.5', value: 25, unit: 'μg/m³', description: 'Partículas finas que pueden penetrar profundamente en los pulmones' },
            { name: 'PM10', value: 45, unit: 'μg/m³', description: 'Partículas gruesas que pueden irritar las vías respiratorias' },
            { name: 'NO2', value: 30, unit: 'μg/m³', description: 'Dióxido de nitrógeno que puede causar problemas respiratorios' },
            { name: 'O3', value: 120, unit: 'μg/m³', description: 'Ozono que puede irritar los ojos y las vías respiratorias' },
            { name: 'SO2', value: 15, unit: 'μg/m³', description: 'Dióxido de azufre que puede causar problemas respiratorios' },
            { name: 'CO', value: 2.5, unit: 'mg/m³', description: 'Monóxido de carbono que puede causar dolores de cabeza' }
        ];
        
        container.innerHTML = pollutants.map(pollutant => `
            <div class="pollutant-card">
                <div class="pollutant-name">${pollutant.name}</div>
                <div class="pollutant-value">${pollutant.value}</div>
                <div class="pollutant-unit">${pollutant.unit}</div>
                <div class="pollutant-description">${pollutant.description}</div>
            </div>
        `).join('');
    }

    loadUserGuideData() {
        this.updatePersonalizedRecommendations();
        this.setupAlertSettings();
    }

    updatePersonalizedRecommendations() {
        const currentAqi = this.getCurrentAqiValue();
        const aqiLevel = this.getAqiLevel(currentAqi);
        
        // Actualizar recomendaciones basadas en el AQI actual
        this.updateOutdoorActivityRecommendation(aqiLevel, currentAqi);
        this.updatePersonalProtectionRecommendation(aqiLevel);
        this.updateHomeRecommendations(aqiLevel);
        this.updateTransportRecommendations(aqiLevel);
    }

    getCurrentAqiValue() {
        const aqiElement = document.getElementById('aqiValue');
        if (aqiElement && aqiElement.textContent !== '--') {
            return parseInt(aqiElement.textContent);
        }
        return 75; // Valor por defecto si no hay datos
    }

    getAqiLevel(aqi) {
        if (aqi <= 50) return 'good';
        if (aqi <= 100) return 'moderate';
        if (aqi <= 150) return 'unhealthy-sensitive';
        if (aqi <= 200) return 'unhealthy';
        if (aqi <= 300) return 'very-unhealthy';
        return 'hazardous';
    }

    updateOutdoorActivityRecommendation(level, aqi) {
        const element = document.getElementById('outdoorActivity');
        const recommendations = {
            'good': `¡Excelente! Con un AQI de ${aqi}, puedes disfrutar de todas las actividades al aire libre sin restricciones. Es un día perfecto para caminar, correr, andar en bicicleta o hacer deportes.`,
            'moderate': `Con un AQI de ${aqi}, las actividades al aire libre están bien para la mayoría de personas. Sin embargo, si eres sensible a la contaminación del aire, considera reducir la intensidad de tus actividades.`,
            'unhealthy-sensitive': `Con un AQI de ${aqi}, se recomienda que los niños, adultos mayores y personas con problemas respiratorios limiten las actividades al aire libre. Los demás pueden continuar con precaución.`,
            'unhealthy': `Con un AQI de ${aqi}, todos deberían evitar actividades extenuantes al aire libre. Si debes salir, hazlo por períodos cortos y evita las horas pico de contaminación.`,
            'very-unhealthy': `Con un AQI de ${aqi}, se recomienda evitar todas las actividades al aire libre. Si es absolutamente necesario salir, usa mascarilla y limita el tiempo al mínimo.`,
            'hazardous': `Con un AQI de ${aqi}, es peligroso estar al aire libre. Permanece en interiores con las ventanas cerradas y evita cualquier actividad exterior.`
        };
        
        element.textContent = recommendations[level] || recommendations['moderate'];
    }

    updatePersonalProtectionRecommendation(level) {
        const element = document.getElementById('personalProtection');
        const recommendations = {
            'good': 'No se requieren medidas especiales de protección. Disfruta del aire limpio y mantén tu rutina normal.',
            'moderate': 'Considera usar una mascarilla si eres sensible a la contaminación. Mantente hidratado y evita fumar.',
            'unhealthy-sensitive': 'Usa mascarilla N95 si sales al exterior. Evita el ejercicio intenso y mantén las ventanas cerradas en casa.',
            'unhealthy': 'Usa mascarilla N95 o superior. Evita salir durante las horas pico de contaminación (6-10 AM y 6-8 PM).',
            'very-unhealthy': 'Usa mascarilla N95 o superior en todo momento al salir. Considera usar purificadores de aire en interiores.',
            'hazardous': 'Usa mascarilla N95 o superior y limita al máximo el tiempo al aire libre. Usa purificadores de aire en interiores.'
        };
        
        element.textContent = recommendations[level] || recommendations['moderate'];
    }

    updateHomeRecommendations(level) {
        const element = document.getElementById('homeRecommendations');
        const recommendations = {
            'good': 'Mantén las ventanas abiertas para una buena ventilación. Es un buen momento para limpiar y ventilar tu hogar.',
            'moderate': 'Puedes ventilar tu hogar, pero evita las horas pico de contaminación. Considera usar purificadores de aire si tienes problemas respiratorios.',
            'unhealthy-sensitive': 'Mantén las ventanas cerradas durante las horas pico. Usa purificadores de aire y evita actividades que generen contaminación interior.',
            'unhealthy': 'Mantén las ventanas cerradas y usa purificadores de aire. Evita fumar, cocinar con aceite o usar productos químicos fuertes.',
            'very-unhealthy': 'Mantén todas las ventanas cerradas y usa purificadores de aire de alta eficiencia. Evita cualquier actividad que genere contaminación interior.',
            'hazardous': 'Mantén todas las ventanas cerradas y usa purificadores de aire de alta eficiencia. Considera sellar las aberturas y usar sistemas de filtración avanzados.'
        };
        
        element.textContent = recommendations[level] || recommendations['moderate'];
    }

    updateTransportRecommendations(level) {
        const element = document.getElementById('transportRecommendations');
        const recommendations = {
            'good': 'Puedes usar cualquier medio de transporte. Es un buen día para caminar o andar en bicicleta si las distancias lo permiten.',
            'moderate': 'Evita caminar o andar en bicicleta en calles muy transitadas. Usa transporte público o vehículo con aire acondicionado.',
            'unhealthy-sensitive': 'Evita caminar o andar en bicicleta. Usa transporte público o vehículo con aire acondicionado y filtros de aire.',
            'unhealthy': 'Usa solo vehículo con aire acondicionado y filtros de aire. Evita el transporte público si no tiene filtración adecuada.',
            'very-unhealthy': 'Evita salir en vehículo si no es absolutamente necesario. Si debes hacerlo, usa vehículo con filtros de aire de alta eficiencia.',
            'hazardous': 'Evita salir en vehículo. Si es absolutamente necesario, usa vehículo con filtros de aire de alta eficiencia y mantén las ventanas cerradas.'
        };
        
        element.textContent = recommendations[level] || recommendations['moderate'];
    }

    setupAlertSettings() {
        // Cargar configuraciones guardadas
        this.loadAlertSettings();
        
        // Configurar evento para guardar alertas
        document.getElementById('saveAlertsBtn').addEventListener('click', () => {
            this.saveAlertSettings();
        });
    }

    loadAlertSettings() {
        const settings = JSON.parse(localStorage.getItem('airQualityAlerts') || '{}');
        
        document.getElementById('alertUnhealthy').checked = settings.alertUnhealthy !== false;
        document.getElementById('alertSensitive').checked = settings.alertSensitive !== false;
        document.getElementById('alertDaily').checked = settings.alertDaily === true;
    }

    saveAlertSettings() {
        const settings = {
            alertUnhealthy: document.getElementById('alertUnhealthy').checked,
            alertSensitive: document.getElementById('alertSensitive').checked,
            alertDaily: document.getElementById('alertDaily').checked
        };
        
        localStorage.setItem('airQualityAlerts', JSON.stringify(settings));
        
        // Mostrar notificación de confirmación
        this.showNotification('Configuración de alertas guardada correctamente', 'success');
        
        // Configurar alertas basadas en las nuevas configuraciones
        this.setupAlertSystem(settings);
    }

    setupAlertSystem(settings) {
        // Limpiar alertas existentes
        if (this.alertInterval) {
            clearInterval(this.alertInterval);
        }
        
        // Configurar verificación periódica de alertas
        this.alertInterval = setInterval(() => {
            this.checkAlertConditions(settings);
        }, 300000); // Verificar cada 5 minutos
    }

    checkAlertConditions(settings) {
        const currentAqi = this.getCurrentAqiValue();
        
        if (settings.alertUnhealthy && currentAqi >= 151) {
            this.showNotification(`Alerta: AQI insalubre (${currentAqi}). Evita actividades al aire libre.`, 'danger');
        } else if (settings.alertSensitive && currentAqi >= 101) {
            this.showNotification(`Alerta: AQI insalubre para grupos sensibles (${currentAqi}). Toma precauciones.`, 'warning');
        }
    }

    // Health Functions
    async loadHealthData() {
        try {
            // Load health configuration first
            this.setupHealthConfiguration();
            
            // Setup notification settings
            this.setupNotificationSettings();
            
            // Initialize notifications
            this.initializeNotifications();
            
            // Show loading state
            this.showHealthLoadingState();
            
            // Load data with error handling
            let weatherData, aqiData;
            try {
                weatherData = await this.getCurrentWeatherData();
                aqiData = await this.getCurrentAQIData();
            } catch (dataError) {
                console.error('Error loading health data:', dataError);
                // Use fallback data
                weatherData = this.generateSimulatedWeatherData(this.getCurrentLocationData());
                aqiData = this.generateSimulatedAQIData();
            }
            
            // Update all health sections
            await this.updateHealthRiskAssessment(weatherData, aqiData);
            await this.updateHealthAlerts(weatherData, aqiData);
            await this.updateMedicalRecommendations(weatherData, aqiData);
            await this.loadHealthForecast();
            
            // Update data source status
            this.updateDataSourceStatus(weatherData, aqiData);
            
            // Check for air quality alerts
            this.checkAirQualityAlerts();
            
            // Force test notification if enabled
            if (this.notificationSettings.enabled) {
                setTimeout(() => {
                    this.sendTestAlert();
                }, 3000);
            }
            
            // Hide loading state
            this.hideHealthLoadingState();
            
        } catch (error) {
            console.error('Error loading health data:', error);
            this.hideHealthLoadingState();
            this.showNotification('Error al cargar datos de salud', 'error');
        }
    }

    showHealthLoadingState() {
        const loadingElements = document.querySelectorAll('#health-section .loading-alerts, #health-section .loading-forecast, #health-section .loading-recommendation');
        loadingElements.forEach(element => {
            element.style.display = 'flex';
        });
    }

    hideHealthLoadingState() {
        const loadingElements = document.querySelectorAll('#health-section .loading-alerts, #health-section .loading-forecast, #health-section .loading-recommendation');
        loadingElements.forEach(element => {
            element.style.display = 'none';
        });
    }

    async updateHealthRiskAssessment(weatherData, aqiData) {
        try {
            const locationData = this.getCurrentLocationData();
            
            // Update location and timestamp
            document.getElementById('healthLocation').textContent = locationData.name;
            document.getElementById('healthTimestamp').textContent = `Última actualización: ${new Date().toLocaleTimeString('es-ES')}`;
            
            // Calculate health risks
            const risks = this.calculateHealthRisks(weatherData, aqiData);
            
            // Update risk displays
            this.updateRiskDisplay('respiratoryRiskValue', risks.respiratory);
            this.updateRiskDisplay('cardiacRiskValue', risks.cardiac);
            this.updateRiskDisplay('pediatricRiskValue', risks.pediatric);
            this.updateRiskDisplay('elderlyRiskValue', risks.elderly);
            
        } catch (error) {
            console.error('Error updating health risk assessment:', error);
        }
    }

    calculateHealthRisks(weatherData, aqiData) {
        const aqi = aqiData.aqi || 50;
        const temperature = weatherData.temperature || 20;
        const humidity = weatherData.humidity || 50;
        const windSpeed = weatherData.windSpeed || 10;
        
        const risks = {
            respiratory: this.getRiskLevel(aqi, 'respiratory'),
            cardiac: this.getRiskLevel(aqi, 'cardiac'),
            pediatric: this.getRiskLevel(aqi, 'pediatric'),
            elderly: this.getRiskLevel(aqi, 'elderly')
        };
        
        // Adjust risks based on weather conditions
        if (temperature < 5 || temperature > 35) {
            risks.respiratory = this.increaseRiskLevel(risks.respiratory);
            risks.cardiac = this.increaseRiskLevel(risks.cardiac);
        }
        
        if (humidity > 80) {
            risks.respiratory = this.increaseRiskLevel(risks.respiratory);
        }
        
        return risks;
    }

    getRiskLevel(aqi, riskType) {
        if (aqi <= 50) return 'Bajo';
        if (aqi <= 100) return 'Moderado';
        if (aqi <= 150) return 'Alto';
        if (aqi <= 200) return 'Muy Alto';
        return 'Crítico';
    }

    increaseRiskLevel(riskLevel) {
        const levels = ['Bajo', 'Moderado', 'Alto', 'Muy Alto', 'Crítico'];
        const currentIndex = levels.indexOf(riskLevel);
        return levels[Math.min(currentIndex + 1, levels.length - 1)];
    }

    updateRiskDisplay(elementId, riskLevel) {
        const element = document.getElementById(elementId);
        element.textContent = riskLevel;
        element.className = 'risk-value';
        
        if (riskLevel === 'Bajo') element.classList.add('low');
        else if (riskLevel === 'Moderado') element.classList.add('moderate');
        else element.classList.add('high');
    }

    async updateHealthAlerts(weatherData, aqiData) {
        try {
            const alerts = this.generateHealthAlerts(weatherData, aqiData);
            const alertsContainer = document.getElementById('healthAlertsContent');
            
            if (alerts.length === 0) {
                alertsContainer.innerHTML = '<div class="no-alerts">No hay alertas médicas activas</div>';
                return;
            }
            
            alertsContainer.innerHTML = alerts.map(alert => `
                <div class="alert-item health-alert-item">
                    <i class="fas ${alert.icon}"></i>
                    <div class="alert-info">
                        <strong>${alert.title}</strong>
                        <p>${alert.message}</p>
                        <small>${alert.timestamp}</small>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error updating health alerts:', error);
        }
    }

    generateHealthAlerts(weatherData, aqiData) {
        const alerts = [];
        const aqi = aqiData.aqi || 50;
        const temperature = weatherData.temperature || 20;
        const humidity = weatherData.humidity || 50;
        
        // AQI-based alerts
        if (aqi > 100) {
            alerts.push({
                icon: 'fa-lungs',
                title: 'Alerta Respiratoria',
                message: `AQI ${aqi}: Recomendar mascarillas a pacientes respiratorios y limitar actividades al aire libre.`,
                timestamp: new Date().toLocaleTimeString('es-ES')
            });
        }
        
        if (aqi > 150) {
            alerts.push({
                icon: 'fa-heart',
                title: 'Alerta Cardíaca',
                message: `AQI ${aqi}: Pacientes cardíacos deben evitar esfuerzos físicos al aire libre.`,
                timestamp: new Date().toLocaleTimeString('es-ES')
            });
        }
        
        if (aqi > 200) {
            alerts.push({
                icon: 'fa-exclamation-triangle',
                title: 'Alerta Crítica',
                message: `AQI ${aqi}: Considerar cancelar cirugías no urgentes y preparar equipos de emergencia.`,
                timestamp: new Date().toLocaleTimeString('es-ES')
            });
        }
        
        // Weather-based alerts
        if (temperature < 5) {
            alerts.push({
                icon: 'fa-thermometer-half',
                title: 'Alerta por Frío',
                message: `Temperatura ${temperature}°C: Aumentar precauciones para pacientes respiratorios y cardíacos.`,
                timestamp: new Date().toLocaleTimeString('es-ES')
            });
        }
        
        if (humidity > 80) {
            alerts.push({
                icon: 'fa-tint',
                title: 'Alerta por Humedad',
                message: `Humedad ${humidity}%: Mayor riesgo de problemas respiratorios en pacientes sensibles.`,
                timestamp: new Date().toLocaleTimeString('es-ES')
            });
        }
        
        return alerts;
    }

    async updateMedicalRecommendations(weatherData, aqiData) {
        try {
            const recommendations = this.generateMedicalRecommendations(weatherData, aqiData);
            
            // Update hospital recommendations
            document.getElementById('hospitalRecommendations').innerHTML = 
                recommendations.hospital.map(rec => `<li>${rec}</li>`).join('');
            
            // Update clinic recommendations
            document.getElementById('clinicRecommendations').innerHTML = 
                recommendations.clinic.map(rec => `<li>${rec}</li>`).join('');
            
            // Update emergency recommendations
            document.getElementById('emergencyRecommendations').innerHTML = 
                recommendations.emergency.map(rec => `<li>${rec}</li>`).join('');
            
            // Update homecare recommendations
            document.getElementById('homecareRecommendations').innerHTML = 
                recommendations.homecare.map(rec => `<li>${rec}</li>`).join('');
            
        } catch (error) {
            console.error('Error updating medical recommendations:', error);
        }
    }

    generateMedicalRecommendations(weatherData, aqiData) {
        const aqi = aqiData.aqi || 50;
        const temperature = weatherData.temperature || 20;
        const humidity = weatherData.humidity || 50;
        
        const recommendations = {
            hospital: [],
            clinic: [],
            emergency: [],
            homecare: []
        };
        
        // Hospital recommendations
        if (aqi > 100) {
            recommendations.hospital.push('Aumentar ventilación en salas de cuidados intensivos');
            recommendations.hospital.push('Revisar filtros de aire en áreas críticas');
            recommendations.hospital.push('Considerar limitar visitas de familiares');
        }
        
        if (aqi > 150) {
            recommendations.hospital.push('Preparar equipos adicionales para emergencias respiratorias');
            recommendations.hospital.push('Revisar protocolos de cirugías no urgentes');
        }
        
        // Clinic recommendations
        if (aqi > 75) {
            recommendations.clinic.push('Recomendar mascarillas a pacientes respiratorios');
            recommendations.clinic.push('Programar citas de seguimiento más frecuentes');
        }
        
        if (aqi > 100) {
            recommendations.clinic.push('Considerar consultas telefónicas para pacientes de riesgo');
            recommendations.clinic.push('Aumentar stock de medicamentos respiratorios');
        }
        
        // Emergency recommendations
        if (aqi > 100) {
            recommendations.emergency.push('Preparar equipos para picos de llamadas respiratorias');
            recommendations.emergency.push('Optimizar rutas de ambulancias evitando zonas contaminadas');
        }
        
        if (aqi > 150) {
            recommendations.emergency.push('Activar protocolos de emergencia ambiental');
            recommendations.emergency.push('Coordinar con hospitales para preparar camas adicionales');
        }
        
        // Homecare recommendations
        if (aqi > 50) {
            recommendations.homecare.push('Recomendar cerrar ventanas y usar purificadores de aire');
            recommendations.homecare.push('Limitar actividades al aire libre para pacientes sensibles');
        }
        
        if (aqi > 100) {
            recommendations.homecare.push('Recomendar mascarillas N95 para salidas esenciales');
            recommendations.homecare.push('Aumentar frecuencia de visitas domiciliarias');
        }
        
        return recommendations;
    }

    async loadHealthForecast() {
        try {
            const forecast = await this.getHealthForecast();
            const forecastContainer = document.getElementById('healthForecastContent');
            
            forecastContainer.innerHTML = `
                <div class="health-forecast-timeline">
                    ${forecast.map(day => `
                        <div class="forecast-day health-forecast-day">
                            <div class="forecast-day-name">${day.date}</div>
                            <div class="forecast-day-aqi">AQI: ${day.aqi}</div>
                            <div class="forecast-day-risk">Riesgo: ${day.riskLevel}</div>
                            <div class="forecast-day-recommendations">
                                ${day.recommendations.map(rec => `<div class="forecast-recommendation">${rec}</div>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
        } catch (error) {
            console.error('Error loading health forecast:', error);
            document.getElementById('healthForecastContent').innerHTML = 
                '<div class="forecast-error">Error al cargar pronóstico de salud</div>';
        }
    }

    async getHealthForecast() {
        // Simulate health forecast data
        const forecast = [];
        for (let i = 0; i < 5; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            
            const aqi = 50 + Math.random() * 100;
            const riskLevel = this.getRiskLevel(aqi, 'respiratory');
            
            forecast.push({
                date: date.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' }),
                aqi: Math.round(aqi),
                riskLevel: riskLevel,
                recommendations: this.getForecastRecommendations(aqi)
            });
        }
        
        return forecast;
    }

    getForecastRecommendations(aqi) {
        const recommendations = [];
        
        if (aqi > 100) {
            recommendations.push('Preparar equipos adicionales');
            recommendations.push('Revisar protocolos de emergencia');
        }
        
        if (aqi > 150) {
            recommendations.push('Activar alertas médicas');
            recommendations.push('Coordinar con servicios de emergencia');
        }
        
        return recommendations;
    }

    setupHealthConfiguration() {
        // Wait for DOM elements to be available
        setTimeout(() => {
            try {
                // Load saved health configuration
                const savedConfig = localStorage.getItem('healthConfiguration');
                if (savedConfig) {
                    const config = JSON.parse(savedConfig);
                    
                    // Set alert checkboxes
                    const alertRespiratory = document.getElementById('alertRespiratory');
                    const alertCardiac = document.getElementById('alertCardiac');
                    const alertPediatric = document.getElementById('alertPediatric');
                    const alertElderly = document.getElementById('alertElderly');
                    
                    if (alertRespiratory) alertRespiratory.checked = config.alertRespiratory !== false;
                    if (alertCardiac) alertCardiac.checked = config.alertCardiac !== false;
                    if (alertPediatric) alertPediatric.checked = config.alertPediatric !== false;
                    if (alertElderly) alertElderly.checked = config.alertElderly !== false;
                    
                    // Set thresholds
                    const criticalThreshold = document.getElementById('criticalThreshold');
                    const alertThreshold = document.getElementById('alertThreshold');
                    
                    if (criticalThreshold) criticalThreshold.value = config.criticalThreshold || 100;
                    if (alertThreshold) alertThreshold.value = config.alertThreshold || 50;
                }
                
                // Add event listeners
                const saveBtn = document.getElementById('saveHealthConfigBtn');
                if (saveBtn) {
                    saveBtn.addEventListener('click', () => {
                        this.saveHealthConfiguration();
                    });
                }
                
                // Add click handlers for alert options
                const alertOptions = document.querySelectorAll('.alert-option');
                alertOptions.forEach(option => {
                    option.addEventListener('click', (e) => {
                        const checkbox = option.querySelector('input[type="checkbox"]');
                        if (checkbox && e.target !== checkbox) {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    });
                });
            } catch (error) {
                console.error('Error setting up health configuration:', error);
            }
        }, 100);
    }

    saveHealthConfiguration() {
        const config = {
            alertRespiratory: document.getElementById('alertRespiratory').checked,
            alertCardiac: document.getElementById('alertCardiac').checked,
            alertPediatric: document.getElementById('alertPediatric').checked,
            alertElderly: document.getElementById('alertElderly').checked,
            criticalThreshold: parseInt(document.getElementById('criticalThreshold').value),
            alertThreshold: parseInt(document.getElementById('alertThreshold').value)
        };
        
        localStorage.setItem('healthConfiguration', JSON.stringify(config));
        this.showNotification('Configuración de salud guardada', 'success');
    }

    // Push Notification Functions
    async initializeNotifications() {
        try {
            console.log('Initializing notifications...');
            
            // Check if notifications are supported
            if (!('Notification' in window)) {
                console.log('Notifications not supported in this browser');
                alert('Este navegador no soporta notificaciones');
                return false;
            }

            console.log('Current notification permission:', Notification.permission);

            // Request permission immediately
            if (Notification.permission === 'default') {
                console.log('Requesting notification permission...');
                const permission = await Notification.requestPermission();
                console.log('Permission result:', permission);
                this.notificationPermission = permission;
                
                if (permission === 'granted') {
                    this.showNotification('Notificaciones activadas correctamente', 'success');
                    // Send welcome notification immediately
                    this.sendWelcomeNotification();
                } else {
                    alert('Las notificaciones fueron denegadas. Por favor, habilítalas en la configuración del navegador.');
                    return false;
                }
            } else if (Notification.permission === 'granted') {
                console.log('Notifications already granted');
                this.notificationPermission = 'granted';
                // Send welcome notification if first time
                this.sendWelcomeNotification();
            } else {
                console.log('Notifications denied');
                alert('Las notificaciones están bloqueadas. Por favor, habilítalas en la configuración del navegador.');
                return false;
            }

            // Try to register service worker (optional)
            try {
                if ('serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.register('/sw.js');
                    console.log('Service Worker registered:', registration);
                }
            } catch (swError) {
                console.log('Service Worker registration failed, using basic notifications:', swError);
            }

            // Load notification settings
            this.loadNotificationSettings();

            // Run diagnostic
            this.checkNotificationSupport();

            // Send immediate test notification
            setTimeout(() => {
                this.sendImmediateTestNotification();
            }, 1000);

            return true;
        } catch (error) {
            console.error('Error initializing notifications:', error);
            return false;
        }
    }

    async requestNotificationPermission() {
        try {
            const permission = await Notification.requestPermission();
            this.notificationPermission = permission;
            
            if (permission === 'granted') {
                this.showNotification('Notificaciones activadas', 'success');
                this.notificationSettings.enabled = true;
                this.saveNotificationSettings();
                return true;
            } else {
                this.showNotification('Notificaciones denegadas', 'warning');
                return false;
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    loadNotificationSettings() {
        const savedSettings = localStorage.getItem('notificationSettings');
        if (savedSettings) {
            this.notificationSettings = { ...this.notificationSettings, ...JSON.parse(savedSettings) };
        }
    }

    saveNotificationSettings() {
        localStorage.setItem('notificationSettings', JSON.stringify(this.notificationSettings));
    }

    async sendPushNotification(title, body, data = {}) {
        try {
            console.log('Attempting to send notification:', title);
            
            // Check if service worker is available
            if (!('serviceWorker' in navigator)) {
                console.log('Service Worker not supported, using basic notification');
                return this.sendBasicNotification(title, body, data);
            }

            // Check if service worker is ready
            const registration = await navigator.serviceWorker.ready;
            console.log('Service Worker ready:', registration);
            
            const options = {
                body: body,
                icon: '/airbytes_favicon.png',
                badge: '/airbytes_favicon.png',
                vibrate: [200, 100, 200],
                data: {
                    dateOfArrival: Date.now(),
                    ...data
                },
                actions: [
                    {
                        action: 'explore',
                        title: 'Ver detalles',
                        icon: '/airbytes_favicon.png'
                    },
                    {
                        action: 'close',
                        title: 'Cerrar',
                        icon: '/airbytes_favicon.png'
                    }
                ],
                requireInteraction: true,
                silent: false,
                tag: 'air-quality-alert'
            };

            await registration.showNotification(title, options);
            console.log('Notification sent successfully via Service Worker');
            return true;
        } catch (error) {
            console.error('Error sending push notification:', error);
            // Fallback to basic notification
            return this.sendBasicNotification(title, body, data);
        }
    }

    async sendBasicNotification(title, body, data = {}) {
        try {
            if (Notification.permission !== 'granted') {
                console.log('Notification permission not granted');
                return false;
            }

            const notification = new Notification(title, {
                body: body,
                icon: '/airbytes_favicon.png',
                badge: '/airbytes_favicon.png',
                tag: 'air-quality-alert',
                data: data,
                requireInteraction: true
            });

            notification.onclick = function() {
                window.focus();
                notification.close();
            };

            console.log('Basic notification sent successfully');
            return true;
        } catch (error) {
            console.error('Error sending basic notification:', error);
            return false;
        }
    }

    async checkAirQualityAlerts() {
        try {
            console.log('Checking air quality alerts...');
            console.log('Notification settings:', this.notificationSettings);
            
            if (!this.notificationSettings.enabled) {
                console.log('Notifications disabled in settings');
                return;
            }

            const aqiData = await this.getCurrentAQIData();
            const weatherData = await this.getCurrentWeatherData();
            const locationData = this.getCurrentLocationData();

            const aqi = aqiData.aqi || 50;
            const temperature = weatherData.temperature || 20;
            const humidity = weatherData.humidity || 50;

            console.log('Current AQI:', aqi, 'Threshold:', this.notificationSettings.aqiThreshold);

            // Check AQI alerts
            if (aqi >= this.notificationSettings.aqiThreshold) {
                const alertLevel = this.getAQILevel(aqi);
                const title = `🚨 Alerta de Calidad del Aire - ${alertLevel}`;
                const body = `AQI: ${aqi} en ${locationData.name}. ${this.getAQIRecommendation(aqi)}`;
                
                console.log('Sending AQI alert:', title);
                await this.sendPushNotification(title, body, {
                    type: 'aqi_alert',
                    aqi: aqi,
                    location: locationData.name,
                    level: alertLevel
                });
            }

            // Check respiratory alerts
            if (this.notificationSettings.respiratoryAlerts && aqi > 75) {
                const title = '🫁 Alerta Respiratoria';
                const body = `AQI ${aqi}: Pacientes respiratorios deben usar mascarillas y limitar actividades al aire libre.`;
                
                await this.sendPushNotification(title, body, {
                    type: 'respiratory_alert',
                    aqi: aqi,
                    location: locationData.name
                });
            }

            // Check cardiac alerts
            if (this.notificationSettings.cardiacAlerts && aqi > 100) {
                const title = '❤️ Alerta Cardíaca';
                const body = `AQI ${aqi}: Pacientes cardíacos deben evitar esfuerzos físicos al aire libre.`;
                
                await this.sendPushNotification(title, body, {
                    type: 'cardiac_alert',
                    aqi: aqi,
                    location: locationData.name
                });
            }

            // Check pediatric alerts
            if (this.notificationSettings.pediatricAlerts && aqi > 50) {
                const title = '👶 Alerta Pediátrica';
                const body = `AQI ${aqi}: Niños y bebés deben limitar tiempo al aire libre.`;
                
                await this.sendPushNotification(title, body, {
                    type: 'pediatric_alert',
                    aqi: aqi,
                    location: locationData.name
                });
            }

            // Check elderly alerts
            if (this.notificationSettings.elderlyAlerts && aqi > 75) {
                const title = '👴 Alerta Adultos Mayores';
                const body = `AQI ${aqi}: Adultos mayores deben evitar actividades al aire libre.`;
                
                await this.sendPushNotification(title, body, {
                    type: 'elderly_alert',
                    aqi: aqi,
                    location: locationData.name
                });
            }

            // Check weather alerts
            if (this.notificationSettings.weatherAlerts) {
                if (temperature < 5) {
                    const title = '❄️ Alerta por Frío';
                    const body = `Temperatura ${temperature}°C: Mayor riesgo para pacientes respiratorios y cardíacos.`;
                    
                    await this.sendPushNotification(title, body, {
                        type: 'weather_alert',
                        temperature: temperature,
                        location: locationData.name
                    });
                }

                if (humidity > 80) {
                    const title = '💧 Alerta por Humedad';
                    const body = `Humedad ${humidity}%: Mayor riesgo de problemas respiratorios.`;
                    
                    await this.sendPushNotification(title, body, {
                        type: 'humidity_alert',
                        humidity: humidity,
                        location: locationData.name
                    });
                }
            }

        } catch (error) {
            console.error('Error checking air quality alerts:', error);
        }
    }

    getAQILevel(aqi) {
        if (aqi <= 50) return 'Bueno';
        if (aqi <= 100) return 'Moderado';
        if (aqi <= 150) return 'Insalubre para grupos sensibles';
        if (aqi <= 200) return 'Insalubre';
        if (aqi <= 300) return 'Muy insalubre';
        return 'Peligroso';
    }

    getAQIRecommendation(aqi) {
        if (aqi <= 50) return 'Calidad del aire satisfactoria.';
        if (aqi <= 100) return 'Calidad del aire aceptable.';
        if (aqi <= 150) return 'Grupos sensibles deben limitar actividades al aire libre.';
        if (aqi <= 200) return 'Todos deben limitar actividades al aire libre.';
        if (aqi <= 300) return 'Evitar actividades al aire libre.';
        return 'Permanecer en interiores con aire filtrado.';
    }

    setupNotificationSettings() {
        // Check if notification settings already exist
        if (document.getElementById('notificationSettings')) {
            return; // Already exists, don't create again
        }
        
        // Create notification settings UI
        const settingsContainer = document.createElement('div');
        settingsContainer.id = 'notificationSettings';
        settingsContainer.innerHTML = `
            <div class="notification-settings-card">
                <div class="settings-header">
                    <i class="fas fa-bell"></i>
                    <h3>Configuración de Notificaciones</h3>
                </div>
                <div class="settings-content">
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" id="notificationsEnabled" ${this.notificationSettings.enabled ? 'checked' : ''}>
                            Activar notificaciones push
                        </label>
                    </div>
                    <div class="setting-item">
                        <label for="aqiThreshold">Umbral de AQI para alertas:</label>
                        <select id="aqiThreshold">
                            <option value="50" ${this.notificationSettings.aqiThreshold === 50 ? 'selected' : ''}>50 (Moderado)</option>
                            <option value="75" ${this.notificationSettings.aqiThreshold === 75 ? 'selected' : ''}>75 (Insalubre para grupos sensibles)</option>
                            <option value="100" ${this.notificationSettings.aqiThreshold === 100 ? 'selected' : ''}>100 (Insalubre)</option>
                            <option value="150" ${this.notificationSettings.aqiThreshold === 150 ? 'selected' : ''}>150 (Muy insalubre)</option>
                        </select>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" id="respiratoryAlerts" ${this.notificationSettings.respiratoryAlerts ? 'checked' : ''}>
                            Alertas respiratorias
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" id="cardiacAlerts" ${this.notificationSettings.cardiacAlerts ? 'checked' : ''}>
                            Alertas cardíacas
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" id="pediatricAlerts" ${this.notificationSettings.pediatricAlerts ? 'checked' : ''}>
                            Alertas pediátricas
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" id="elderlyAlerts" ${this.notificationSettings.elderlyAlerts ? 'checked' : ''}>
                            Alertas adultos mayores
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" id="weatherAlerts" ${this.notificationSettings.weatherAlerts ? 'checked' : ''}>
                            Alertas meteorológicas
                        </label>
                    </div>
                    <button id="saveNotificationSettings" class="save-notification-settings-btn">
                        <i class="fas fa-save"></i>
                        Guardar Configuración
                    </button>
                </div>
            </div>
        `;

        // Add to health section
        const healthSection = document.getElementById('health-section');
        if (healthSection) {
            healthSection.appendChild(settingsContainer);
        }

        // Add event listeners
        document.getElementById('saveNotificationSettings').addEventListener('click', () => {
            this.saveNotificationSettingsFromUI();
        });
    }

    saveNotificationSettingsFromUI() {
        this.notificationSettings = {
            enabled: document.getElementById('notificationsEnabled').checked,
            aqiThreshold: parseInt(document.getElementById('aqiThreshold').value),
            respiratoryAlerts: document.getElementById('respiratoryAlerts').checked,
            cardiacAlerts: document.getElementById('cardiacAlerts').checked,
            pediatricAlerts: document.getElementById('pediatricAlerts').checked,
            elderlyAlerts: document.getElementById('elderlyAlerts').checked,
            weatherAlerts: document.getElementById('weatherAlerts').checked
        };

        this.saveNotificationSettings();
        this.showNotification('Configuración de notificaciones guardada', 'success');
    }

    async testNotification() {
        try {
            console.log('Testing notification...');
            
            // Check if notifications are supported
            if (!('Notification' in window)) {
                alert('Este navegador no soporta notificaciones');
                return;
            }

            console.log('Current permission:', Notification.permission);

            // Request permission if needed
            if (Notification.permission === 'default') {
                console.log('Requesting permission...');
                const permission = await Notification.requestPermission();
                console.log('Permission result:', permission);
                
                if (permission !== 'granted') {
                    alert('Permisos de notificación denegados');
                    return;
                }
            }

            if (Notification.permission === 'denied') {
                alert('Las notificaciones están bloqueadas. Por favor, habilítalas en la configuración del navegador.');
                return;
            }

            // Send immediate test notification
            if (Notification.permission === 'granted') {
                console.log('Sending test notification...');
                
                // Send welcome notification first
                this.sendWelcomeNotification();
                
                // Then send test notification
                setTimeout(() => {
                    const testNotification = new Notification('🔔 AirBytes - Prueba de Notificación', {
                        body: '¡Las notificaciones están funcionando correctamente!',
                        icon: '/airbytes_favicon.png',
                        badge: '/airbytes_favicon.png',
                        tag: 'test-notification',
                        requireInteraction: true,
                        silent: false
                    });

                    testNotification.onclick = function() {
                        console.log('Test notification clicked');
                        window.focus();
                        testNotification.close();
                    };

                    testNotification.onshow = function() {
                        console.log('Test notification shown successfully');
                    };

                    testNotification.onerror = function(error) {
                        console.error('Test notification error:', error);
                    };

                    console.log('Test notification created');
                }, 2000);

                this.showNotification('Notificación de prueba enviada', 'success');
            }

        } catch (error) {
            console.error('Error testing notification:', error);
            this.showNotification('Error al probar notificación', 'error');
        }
    }

    async sendTestAlert() {
        try {
            console.log('Sending test alert...');
            
            const locationData = this.getCurrentLocationData();
            const aqi = 120; // Simulated high AQI for testing
            
            const title = '🚨 Alerta de Prueba - AQI Insalubre';
            const body = `AQI: ${aqi} en ${locationData.name}. Esta es una notificación de prueba.`;
            
            await this.sendPushNotification(title, body, {
                type: 'test_alert',
                aqi: aqi,
                location: locationData.name,
                level: 'Insalubre'
            });
            
            console.log('Test alert sent successfully');
        } catch (error) {
            console.error('Error sending test alert:', error);
        }
    }

    async sendImmediateTestNotification() {
        try {
            console.log('Sending immediate test notification...');
            
            if (Notification.permission !== 'granted') {
                console.log('Notification permission not granted, skipping test');
                return;
            }

            const notification = new Notification('🔔 AirBytes - Notificación de Prueba', {
                body: '¡Las notificaciones están funcionando correctamente!',
                icon: '/airbytes_favicon.png',
                badge: '/airbytes_favicon.png',
                tag: 'test-notification',
                requireInteraction: true,
                silent: false
            });

            notification.onclick = function() {
                console.log('Test notification clicked');
                window.focus();
                notification.close();
            };

            notification.onshow = function() {
                console.log('Test notification shown');
            };

            notification.onerror = function(error) {
                console.error('Test notification error:', error);
            };

            console.log('Immediate test notification sent');
            
            // Also try service worker notification after 2 seconds
            setTimeout(async () => {
                try {
                    await this.sendPushNotification(
                        '🚨 Alerta de Prueba AQI',
                        'AQI: 120 - Calidad del aire insalubre. Esta es una notificación de prueba.',
                        {
                            type: 'test_alert',
                            aqi: 120,
                            location: 'Prueba'
                        }
                    );
                    console.log('Service worker test notification sent');
                } catch (error) {
                    console.error('Service worker test notification failed:', error);
                }
            }, 2000);

        } catch (error) {
            console.error('Error sending immediate test notification:', error);
        }
    }

    async forceNotification() {
        try {
            console.log('Forcing notification...');
            
            // Check if notifications are supported
            if (!('Notification' in window)) {
                alert('Este navegador no soporta notificaciones');
                return;
            }

            // Force permission request
            console.log('Current permission:', Notification.permission);
            
            let permission = Notification.permission;
            if (permission === 'default') {
                console.log('Requesting permission...');
                permission = await Notification.requestPermission();
                console.log('Permission result:', permission);
            }

            if (permission !== 'granted') {
                alert('Permisos de notificación denegados. Por favor, habilítalas en la configuración del navegador.');
                return;
            }

            // Send multiple test notifications
            console.log('Sending forced notifications...');
            
            // Notification 1
            const notification1 = new Notification('🔔 AirBytes - Notificación Forzada 1', {
                body: 'Esta es la primera notificación de prueba',
                icon: '/airbytes_favicon.png',
                tag: 'force-test-1',
                requireInteraction: true
            });

            // Notification 2 (after 1 second)
            setTimeout(() => {
                const notification2 = new Notification('🚨 AirBytes - Alerta AQI Forzada', {
                    body: 'AQI: 150 - Calidad del aire insalubre. Esta es una alerta de prueba.',
                    icon: '/airbytes_favicon.png',
                    tag: 'force-test-2',
                    requireInteraction: true
                });
                
                notification2.onclick = function() {
                    console.log('Force notification 2 clicked');
                    window.focus();
                    notification2.close();
                };
            }, 1000);

            // Notification 3 (after 2 seconds)
            setTimeout(() => {
                const notification3 = new Notification('⚠️ AirBytes - Alerta Meteorológica', {
                    body: 'Temperatura: 5°C - Riesgo para pacientes respiratorios',
                    icon: '/airbytes_favicon.png',
                    tag: 'force-test-3',
                    requireInteraction: true
                });
                
                notification3.onclick = function() {
                    console.log('Force notification 3 clicked');
                    window.focus();
                    notification3.close();
                };
            }, 2000);

            console.log('Forced notifications sent');
            this.showNotification('Notificaciones forzadas enviadas', 'success');

        } catch (error) {
            console.error('Error forcing notifications:', error);
            this.showNotification('Error al forzar notificaciones', 'error');
        }
    }

    async sendWelcomeNotification() {
        try {
            console.log('Sending welcome notification...');
            
            if (Notification.permission !== 'granted') {
                console.log('Notification permission not granted, skipping welcome notification');
                return;
            }

            const welcomeNotification = new Notification('🎉 ¡Bienvenido a AirBytes!', {
                body: 'Gracias por activar las notificaciones. Ahora recibirás alertas sobre la calidad del aire y recomendaciones de salud.',
                icon: '/airbytes_favicon.png',
                badge: '/airbytes_favicon.png',
                tag: 'welcome-notification',
                requireInteraction: true,
                silent: false,
                vibrate: [200, 100, 200, 100, 200]
            });

            welcomeNotification.onclick = function() {
                console.log('Welcome notification clicked');
                window.focus();
                welcomeNotification.close();
            };

            welcomeNotification.onshow = function() {
                console.log('Welcome notification shown successfully');
            };

            welcomeNotification.onerror = function(error) {
                console.error('Welcome notification error:', error);
            };

            console.log('Welcome notification sent successfully');
            
            // Send additional welcome notifications after a delay
            setTimeout(() => {
                this.sendWelcomeFollowUp();
            }, 3000);

        } catch (error) {
            console.error('Error sending welcome notification:', error);
        }
    }

    async sendWelcomeFollowUp() {
        try {
            console.log('Sending welcome follow-up notification...');
            
            const followUpNotification = new Notification('🔔 AirBytes - Configuración Completa', {
                body: 'Tu sistema de alertas está listo. Recibirás notificaciones sobre AQI, alertas respiratorias, cardíacas y más.',
                icon: '/airbytes_favicon.png',
                badge: '/airbytes_favicon.png',
                tag: 'welcome-followup',
                requireInteraction: false,
                silent: false
            });

            followUpNotification.onclick = function() {
                console.log('Welcome follow-up notification clicked');
                window.focus();
                followUpNotification.close();
            };

            console.log('Welcome follow-up notification sent');

        } catch (error) {
            console.error('Error sending welcome follow-up notification:', error);
        }
    }

    async sendSimpleNotification() {
        try {
            console.log('Sending simple notification...');
            
            // Check if notifications are supported
            if (!('Notification' in window)) {
                alert('Este navegador no soporta notificaciones');
                return;
            }

            console.log('Current permission:', Notification.permission);

            // Request permission if needed
            if (Notification.permission === 'default') {
                console.log('Requesting permission...');
                const permission = await Notification.requestPermission();
                console.log('Permission result:', permission);
                
                if (permission !== 'granted') {
                    alert('Permisos de notificación denegados');
                    return;
                }
            }

            if (Notification.permission === 'denied') {
                alert('Las notificaciones están bloqueadas. Por favor, habilítalas en la configuración del navegador.');
                return;
            }

            // Send simple notification
            if (Notification.permission === 'granted') {
                console.log('Creating simple notification...');
                
                const simpleNotification = new Notification('🚀 AirBytes - Notificación Simple', {
                    body: 'Esta es una notificación de prueba simple. Si puedes ver esto, las notificaciones funcionan correctamente.',
                    icon: '/airbytes_favicon.png',
                    badge: '/airbytes_favicon.png',
                    tag: 'simple-test',
                    requireInteraction: true,
                    silent: false
                });

                simpleNotification.onclick = function() {
                    console.log('Simple notification clicked');
                    window.focus();
                    simpleNotification.close();
                };

                simpleNotification.onshow = function() {
                    console.log('Simple notification shown successfully');
                    alert('¡Notificación mostrada correctamente!');
                };

                simpleNotification.onerror = function(error) {
                    console.error('Simple notification error:', error);
                    alert('Error en la notificación: ' + error);
                };

                console.log('Simple notification created');
                this.showNotification('Notificación simple enviada', 'success');
            }

        } catch (error) {
            console.error('Error sending simple notification:', error);
            this.showNotification('Error al enviar notificación simple', 'error');
        }
    }

    // Diagnostic function to check notification support
    checkNotificationSupport() {
        console.log('=== NOTIFICATION DIAGNOSTIC ===');
        console.log('Notification in window:', 'Notification' in window);
        console.log('Current permission:', Notification.permission);
        console.log('Service Worker support:', 'serviceWorker' in navigator);
        console.log('Push Manager support:', 'PushManager' in window);
        
        if ('Notification' in window) {
            console.log('Notification constructor:', Notification);
            console.log('Notification.permission:', Notification.permission);
            console.log('Notification.requestPermission:', typeof Notification.requestPermission);
        }
        
        // Test basic notification creation
        try {
            if (Notification.permission === 'granted') {
                console.log('Creating test notification...');
                const testNotif = new Notification('Test', { body: 'Test notification' });
                console.log('Test notification created:', testNotif);
                testNotif.close();
            }
        } catch (error) {
            console.error('Error creating test notification:', error);
        }
        
        console.log('=== END DIAGNOSTIC ===');
    }

    // Calculate AQI from air quality components
    calculateAQIFromComponents(components) {
        // US EPA AQI calculation
        const pm25 = components.pm2_5;
        const pm10 = components.pm10;
        const o3 = components.o3;
        const no2 = components.no2;
        const so2 = components.so2;
        const co = components.co;

        // Calculate AQI for each pollutant
        const aqiPM25 = this.calculatePollutantAQI(pm25, 'pm25');
        const aqiPM10 = this.calculatePollutantAQI(pm10, 'pm10');
        const aqiO3 = this.calculatePollutantAQI(o3, 'o3');
        const aqiNO2 = this.calculatePollutantAQI(no2, 'no2');
        const aqiSO2 = this.calculatePollutantAQI(so2, 'so2');
        const aqiCO = this.calculatePollutantAQI(co, 'co');

        // Return the highest AQI value
        return Math.max(aqiPM25, aqiPM10, aqiO3, aqiNO2, aqiSO2, aqiCO);
    }

    calculatePollutantAQI(concentration, pollutant) {
        // US EPA AQI breakpoints
        const breakpoints = {
            pm25: [
                [0, 12, 0, 50],
                [12.1, 35.4, 51, 100],
                [35.5, 55.4, 101, 150],
                [55.5, 150.4, 151, 200],
                [150.5, 250.4, 201, 300],
                [250.5, 500.4, 301, 500]
            ],
            pm10: [
                [0, 54, 0, 50],
                [55, 154, 51, 100],
                [155, 254, 101, 150],
                [255, 354, 151, 200],
                [355, 424, 201, 300],
                [425, 604, 301, 500]
            ],
            o3: [
                [0, 0.054, 0, 50],
                [0.055, 0.070, 51, 100],
                [0.071, 0.085, 101, 150],
                [0.086, 0.105, 151, 200],
                [0.106, 0.200, 201, 300]
            ],
            no2: [
                [0, 0.053, 0, 50],
                [0.054, 0.100, 51, 100],
                [0.101, 0.360, 101, 150],
                [0.361, 0.649, 151, 200],
                [0.650, 1.249, 201, 300],
                [1.250, 2.049, 301, 500]
            ],
            so2: [
                [0, 0.034, 0, 50],
                [0.035, 0.144, 51, 100],
                [0.145, 0.224, 101, 150],
                [0.225, 0.304, 151, 200],
                [0.305, 0.604, 201, 300],
                [0.605, 1.004, 301, 500]
            ],
            co: [
                [0, 4.4, 0, 50],
                [4.5, 9.4, 51, 100],
                [9.5, 12.4, 101, 150],
                [12.5, 15.4, 151, 200],
                [15.5, 30.4, 201, 300],
                [30.5, 50.4, 301, 500]
            ]
        };

        const bp = breakpoints[pollutant];
        if (!bp) return 0;

        for (let i = 0; i < bp.length; i++) {
            const [cLow, cHigh, aqiLow, aqiHigh] = bp[i];
            if (concentration >= cLow && concentration <= cHigh) {
                return Math.round(((aqiHigh - aqiLow) / (cHigh - cLow)) * (concentration - cLow) + aqiLow);
            }
        }

        return 0;
    }

    // Display data source status in the UI
    updateDataSourceStatus(weatherData, aqiData) {
        try {
            // Update weather data source
            const weatherSource = document.getElementById('weatherSource');
            if (weatherSource && weatherData) {
                weatherSource.textContent = weatherData.source || 'Datos Simulados';
                weatherSource.className = weatherData.source && weatherData.source.includes('Real') ? 'real-data' : 'simulated-data';
            }

            // Update AQI data source
            const aqiSource = document.getElementById('aqiSource');
            if (aqiSource && aqiData) {
                aqiSource.textContent = aqiData.source || 'Datos Simulados';
                aqiSource.className = aqiData.source && aqiData.source.includes('Real') ? 'real-data' : 'simulated-data';
            }

            // Update timestamp
            const dataTimestamp = document.getElementById('dataTimestamp');
            if (dataTimestamp) {
                const timestamp = weatherData?.timestamp || aqiData?.timestamp || new Date().toISOString();
                dataTimestamp.textContent = `Última actualización: ${new Date(timestamp).toLocaleString('es-ES')}`;
            }

        } catch (error) {
            console.error('Error updating data source status:', error);
        }
    }

    // Agricultural Functions
    async loadFarmersData() {
        try {
            // Load configuration first (fast)
            this.setupCropConfiguration();
            
            // Show loading state
            this.showAgriculturalLoadingState();
            
            // Load data with error handling
            let weatherData, soilData;
            try {
                weatherData = await this.getCurrentWeatherData();
                soilData = await this.getEnhancedSoilData(weatherData);
            } catch (dataError) {
                console.error('Error loading weather/soil data:', dataError);
                // Use fallback data
                weatherData = this.generateSimulatedWeatherData(this.getCurrentLocationData());
                soilData = this.generateSoilData(weatherData);
            }
            
            // Update all sections with the data
            await this.updateAgriculturalWeatherData();
            await this.updateAgriculturalAlerts();
            await this.updateAgriculturalRecommendations();
            await this.loadAgriculturalForecast();
            
            // Hide loading state
            this.hideAgriculturalLoadingState();
            
        } catch (error) {
            console.error('Error loading farmers data:', error);
            this.hideAgriculturalLoadingState();
            this.showNotification('Error al cargar datos agrícolas', 'error');
        }
    }

    async updateAgriculturalWeatherData() {
        const locationData = this.getCurrentLocationData();
        
        // Update location
        document.getElementById('farmLocation').textContent = locationData.name;
        
        // Show loading state
        this.showAgriculturalLoadingState();
        
        try {
            // Get current weather data from real API
            const weatherData = await this.getCurrentWeatherData();
            
            // Update summary data
            document.getElementById('airTemp').textContent = `${weatherData.temperature}°C`;
            document.getElementById('precipitation').textContent = `${weatherData.precipitation} mm`;
            document.getElementById('windSpeed').textContent = `${weatherData.windSpeed} km/h`;
            document.getElementById('windDirection').textContent = weatherData.windDirection;
            
            // Update detailed data
            document.getElementById('detailedAirTemp').textContent = `${weatherData.temperature}°C`;
            document.getElementById('humidity').textContent = `${weatherData.humidity}%`;
            document.getElementById('pressure').textContent = `${weatherData.pressure} hPa`;
            
            // Get enhanced soil data based on real weather
            const soilData = await this.getEnhancedSoilData(weatherData);
            document.getElementById('soilTemp').textContent = `${soilData.temperature}°C`;
            document.getElementById('soilMoisture').textContent = `${soilData.moisture}%`;
            document.getElementById('solarRadiation').textContent = `${soilData.solarRadiation} W/m²`;
            
            // Update precipitation and wind details
            document.getElementById('detailedPrecipitation').textContent = `${weatherData.precipitation} mm`;
            document.getElementById('detailedWindSpeed').textContent = `${weatherData.windSpeed} km/h`;
            document.getElementById('detailedWindDirection').textContent = weatherData.windDirection;
            
            // Update additional real-time data
            this.updateAdditionalWeatherData(weatherData);
            
            // Update trends based on real data
            await this.updateRealDataTrends(weatherData);
            
            // Hide loading state
            this.hideAgriculturalLoadingState();
            
        } catch (error) {
            console.error('Error updating agricultural weather data:', error);
            this.showNotification('Error al cargar datos meteorológicos en tiempo real', 'error');
            this.hideAgriculturalLoadingState();
        }
    }

    async getCurrentWeatherData() {
        try {
            const locationData = this.getCurrentLocationData();
            console.log('🌤️ Fetching REAL weather data for:', locationData.name);
            console.log('🌤️ Use Real Data setting:', this.useRealData);
            
            // FORCE real data usage
            if (this.useRealData) {
                try {
                    const url = `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric&lang=es`;
                    console.log('🌤️ Weather API URL:', url);
                    
                    const response = await fetch(url);
                    console.log('🌤️ Weather API Response Status:', response.status);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log('🌤️ REAL weather data received:', data);
                        
                        const weatherData = {
                            temperature: Math.round(data.main.temp),
                            humidity: data.main.humidity,
                            pressure: data.main.pressure,
                            windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
                            windDirection: this.getWindDirection(data.wind.deg),
                            precipitation: data.rain ? (data.rain['1h'] || 0) : 0,
                            description: data.weather[0].description,
                            icon: data.weather[0].icon,
                            visibility: data.visibility / 1000, // Convert to km
                            uvIndex: data.uvi || 0,
                            cloudiness: data.clouds.all,
                            sunrise: new Date(data.sys.sunrise * 1000),
                            sunset: new Date(data.sys.sunset * 1000),
                            timestamp: new Date().toISOString(),
                            source: '🌤️ OpenWeatherMap REAL DATA',
                            location: locationData.name,
                            isRealData: true
                        };
                        
                        console.log('🌤️ Returning REAL weather data:', weatherData);
                        return weatherData;
                    } else {
                        console.error('🌤️ Weather API response not ok:', response.status, response.statusText);
                        throw new Error(`Weather API error: ${response.status}`);
                    }
                } catch (apiError) {
                    console.error('🌤️ Weather API failed:', apiError);
                    throw apiError;
                }
            } else {
                console.log('🌤️ Real data disabled, using simulated data');
                throw new Error('Real data disabled');
            }
        } catch (error) {
            console.error('Error fetching weather data:', error);
            console.log('Using simulated weather data as fallback');
            // Fallback to existing data or generate realistic data
            const tempElement = document.getElementById('weatherTemp');
            const humidityElement = document.getElementById('weatherHumidity');
            const windElement = document.getElementById('weatherWind');
            
            return {
                temperature: tempElement ? parseInt(tempElement.textContent) : 22,
                humidity: humidityElement ? parseInt(humidityElement.textContent) : 65,
                pressure: 1013 + Math.floor(Math.random() * 20 - 10),
                windSpeed: windElement ? parseInt(windElement.textContent) : 12,
                windDirection: this.getWindDirection(Math.random() * 360),
                precipitation: Math.floor(Math.random() * 15),
                description: 'Datos no disponibles',
                icon: '01d',
                visibility: 10,
                uvIndex: 5,
                cloudiness: 50,
                sunrise: new Date(),
                sunset: new Date()
            };
        }
    }

    async getCurrentAQIData() {
        try {
            const locationData = this.getCurrentLocationData();
            console.log('🌬️ Fetching REAL AQI data for:', locationData.name);
            console.log('🌬️ Use Real Data setting:', this.useRealData);
            
            // FORCE real data usage
            if (this.useRealData) {
                try {
                    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`;
                    console.log('🌬️ AQI API URL:', url);
                    
                    const aqiResponse = await fetch(url);
                    console.log('🌬️ AQI API Response Status:', aqiResponse.status);
                    
                    if (aqiResponse.ok) {
                        const aqiData = await aqiResponse.json();
                        console.log('🌬️ REAL AQI data received:', aqiData);
                        
                        // Convert OpenWeatherMap data to our format
                        const airQuality = aqiData.list[0];
                        const aqi = this.calculateAQIFromComponents(airQuality.components);
                        
                        const aqiDataFormatted = {
                            aqi: aqi,
                            pm25: airQuality.components.pm2_5,
                            pm10: airQuality.components.pm10,
                            o3: airQuality.components.o3,
                            no2: airQuality.components.no2,
                            so2: airQuality.components.so2,
                            co: airQuality.components.co,
                            timestamp: new Date(airQuality.dt * 1000).toISOString(),
                            source: '🌬️ OpenWeatherMap REAL DATA',
                            location: locationData.name,
                            isRealData: true
                        };
                        
                        console.log('🌬️ Returning REAL AQI data:', aqiDataFormatted);
                        return aqiDataFormatted;
                    } else {
                        console.error('🌬️ AQI API response not ok:', aqiResponse.status, aqiResponse.statusText);
                        throw new Error(`AQI API error: ${aqiResponse.status}`);
                    }
                } catch (apiError) {
                    console.error('🌬️ AQI API failed:', apiError);
                    throw apiError;
                }
            } else {
                console.log('🌬️ Real data disabled, using simulated data');
                throw new Error('Real data disabled');
            }
            
        } catch (error) {
            console.error('🌬️ Error fetching AQI data:', error);
            console.log('🌬️ Using simulated AQI data as fallback');
            return this.generateSimulatedAQIData();
        }
    }

    generateSimulatedAQIData() {
        // Generate realistic AQI data based on time and location
        const hour = new Date().getHours();
        const baseAQI = 30 + Math.random() * 70; // AQI between 30-100
        
        // Higher AQI during rush hours (7-9 AM, 5-7 PM)
        let aqi = baseAQI;
        if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
            aqi += 20 + Math.random() * 30;
        }
        
        // Lower AQI at night
        if (hour >= 22 || hour <= 6) {
            aqi -= 10;
        }
        
        aqi = Math.max(0, Math.min(300, aqi)); // Clamp between 0-300
        
        return {
            aqi: Math.round(aqi),
            pm25: Math.round(aqi * 0.8 + Math.random() * 10),
            pm10: Math.round(aqi * 1.2 + Math.random() * 15),
            o3: Math.round(aqi * 0.6 + Math.random() * 8),
            no2: Math.round(aqi * 0.4 + Math.random() * 5),
            so2: Math.round(aqi * 0.3 + Math.random() * 3),
            co: Math.round(aqi * 0.1 + Math.random() * 2),
            timestamp: new Date().toISOString(),
            source: 'Simulated Data'
        };
    }

    async getEnhancedSoilData(weatherData) {
        try {
            // Simple and fast soil data calculation
            const airTemp = weatherData.temperature;
            const humidity = weatherData.humidity;
            const precipitation = weatherData.precipitation || 0;
            const cloudiness = weatherData.cloudiness || 50;
            
            // Soil temperature calculation
            const soilTemp = airTemp - 2 + (Math.random() - 0.5) * 2;
            
            // Soil moisture calculation
            const baseMoisture = 40 + (humidity * 0.3) + (precipitation * 2);
            const soilMoisture = Math.min(95, Math.max(10, baseMoisture + (Math.random() * 10 - 5)));
            
            // Solar radiation calculation
            const hour = new Date().getHours();
            let solarRadiation = 0;
            if (hour >= 6 && hour <= 18) {
                solarRadiation = 200 + (Math.sin((hour - 6) * Math.PI / 12) * 400);
                solarRadiation *= (1 - cloudiness / 200);
                if (precipitation > 5) solarRadiation *= 0.3;
                if (humidity > 80) solarRadiation *= 0.7;
            }
            
            return {
                temperature: Math.round(soilTemp * 10) / 10,
                moisture: Math.round(soilMoisture),
                solarRadiation: Math.round(solarRadiation),
                timestamp: new Date().toISOString(),
                source: 'Enhanced Data'
            };
        } catch (error) {
            console.error('Error generating enhanced soil data:', error);
            // Fallback to basic calculation
            return this.generateSoilData(weatherData);
        }
    }

    generateSoilData(weatherData) {
        // Simulate soil temperature (usually 2-4°C lower than air temp)
        const soilTemp = weatherData.temperature - 3 + (Math.random() * 2 - 1);
        
        // Simulate soil moisture based on recent precipitation and humidity
        const baseMoisture = 40 + (weatherData.humidity * 0.3) + (weatherData.precipitation * 2);
        const soilMoisture = Math.min(95, Math.max(10, baseMoisture + (Math.random() * 10 - 5)));
        
        // Simulate solar radiation based on time of day and weather
        const hour = new Date().getHours();
        let solarRadiation = 0;
        if (hour >= 6 && hour <= 18) {
            solarRadiation = 200 + (Math.sin((hour - 6) * Math.PI / 12) * 600);
            if (weatherData.precipitation > 5) solarRadiation *= 0.3;
            if (weatherData.humidity > 80) solarRadiation *= 0.7;
        }
        
        return {
            temperature: Math.round(soilTemp * 10) / 10,
            moisture: Math.round(soilMoisture),
            solarRadiation: Math.round(solarRadiation)
        };
    }

    getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                           'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    updateDataTrends() {
        // Simulate trend data
        const trends = ['rising', 'falling', 'stable'];
        const trendTexts = {
            'rising': '↗',
            'falling': '↘',
            'stable': '→'
        };
        
        const trendElements = document.querySelectorAll('.data-trend');
        trendElements.forEach(element => {
            const trend = trends[Math.floor(Math.random() * trends.length)];
            element.className = `data-trend ${trend}`;
            element.textContent = trendTexts[trend];
        });
    }

    async updateRealDataTrends(weatherData) {
        // Store previous data for trend calculation
        const previousData = JSON.parse(localStorage.getItem('previousWeatherData') || '{}');
        
        // Calculate trends based on real data comparison
        const trends = {};
        
        if (previousData.temperature) {
            trends.temperature = weatherData.temperature > previousData.temperature ? 'rising' : 
                                weatherData.temperature < previousData.temperature ? 'falling' : 'stable';
        }
        
        if (previousData.humidity) {
            trends.humidity = weatherData.humidity > previousData.humidity ? 'rising' : 
                             weatherData.humidity < previousData.humidity ? 'falling' : 'stable';
        }
        
        if (previousData.pressure) {
            trends.pressure = weatherData.pressure > previousData.pressure ? 'rising' : 
                             weatherData.pressure < previousData.pressure ? 'falling' : 'stable';
        }
        
        if (previousData.windSpeed) {
            trends.windSpeed = weatherData.windSpeed > previousData.windSpeed ? 'rising' : 
                              weatherData.windSpeed < previousData.windSpeed ? 'falling' : 'stable';
        }
        
        // Update trend displays
        this.updateTrendDisplay('airTempTrend', trends.temperature);
        this.updateTrendDisplay('humidityTrend', trends.humidity);
        this.updateTrendDisplay('pressureTrend', trends.pressure);
        this.updateTrendDisplay('windSpeedTrend', trends.windSpeed);
        
        // Store current data for next comparison
        localStorage.setItem('previousWeatherData', JSON.stringify(weatherData));
    }

    updateTrendDisplay(elementId, trend) {
        const element = document.getElementById(elementId);
        if (element && trend) {
            const trendTexts = {
                'rising': '↗',
                'falling': '↘',
                'stable': '→'
            };
            element.className = `data-trend ${trend}`;
            element.textContent = trendTexts[trend];
        }
    }

    updateAdditionalWeatherData(weatherData) {
        // Update additional weather information if elements exist
        const additionalData = {
            visibility: weatherData.visibility,
            uvIndex: weatherData.uvIndex,
            cloudiness: weatherData.cloudiness,
            description: weatherData.description,
            sunrise: weatherData.sunrise,
            sunset: weatherData.sunset
        };
        
        // Store additional data for use in recommendations
        this.currentWeatherAdditional = additionalData;
    }

    showAgriculturalLoadingState() {
        const loadingElements = document.querySelectorAll('#farmers-section .data-value, #farmers-section .summary-value');
        loadingElements.forEach(element => {
            element.textContent = '...';
            element.style.opacity = '0.6';
        });
    }

    hideAgriculturalLoadingState() {
        const loadingElements = document.querySelectorAll('#farmers-section .data-value, #farmers-section .summary-value');
        loadingElements.forEach(element => {
            element.style.opacity = '1';
        });
    }

    async updateAgriculturalAlerts() {
        try {
            const weatherData = await this.getCurrentWeatherData();
            const soilData = await this.getEnhancedSoilData(weatherData);
            
            // Frost risk assessment
            const frostRisk = this.assessFrostRisk(weatherData, soilData);
            document.getElementById('frostRisk').textContent = frostRisk;
            
            // Storm risk assessment
            const stormRisk = this.assessStormRisk(weatherData);
            document.getElementById('stormRisk').textContent = stormRisk;
            
            // Drought risk assessment
            const droughtRisk = this.assessDroughtRisk(weatherData, soilData);
            document.getElementById('droughtRisk').textContent = droughtRisk;
        } catch (error) {
            console.error('Error updating agricultural alerts:', error);
            // Show basic alerts
            document.getElementById('frostRisk').textContent = 'Evaluando condiciones...';
            document.getElementById('stormRisk').textContent = 'Evaluando condiciones...';
            document.getElementById('droughtRisk').textContent = 'Evaluando condiciones...';
        }
    }

    assessFrostRisk(weatherData, soilData) {
        const temp = weatherData.temperature;
        const humidity = weatherData.humidity;
        const windSpeed = weatherData.windSpeed;
        
        if (temp <= 2) {
            return 'ALTO - Temperatura muy baja. Protege cultivos sensibles con cubiertas o invernaderos.';
        } else if (temp <= 5 && humidity > 80 && windSpeed < 5) {
            return 'MEDIO - Condiciones favorables para heladas. Monitorea durante la noche.';
        } else if (temp <= 8 && humidity > 70) {
            return 'BAJO - Posible riesgo de heladas leves. Mantén vigilancia.';
        } else {
            return 'MÍNIMO - Condiciones seguras para la mayoría de cultivos.';
        }
    }

    assessStormRisk(weatherData) {
        const pressure = weatherData.pressure;
        const humidity = weatherData.humidity;
        const windSpeed = weatherData.windSpeed;
        
        if (pressure < 1000 && humidity > 85 && windSpeed > 25) {
            return 'ALTO - Tormenta severa probable. Protege cultivos y equipos.';
        } else if (pressure < 1010 && humidity > 75 && windSpeed > 15) {
            return 'MEDIO - Posible tormenta. Prepara medidas de protección.';
        } else if (pressure < 1020 && humidity > 65) {
            return 'BAJO - Condiciones inestables. Monitorea el pronóstico.';
        } else {
            return 'MÍNIMO - Condiciones estables. Buen momento para labores agrícolas.';
        }
    }

    assessDroughtRisk(weatherData, soilData) {
        const soilMoisture = soilData.moisture;
        const precipitation = weatherData.precipitation;
        const humidity = weatherData.humidity;
        
        if (soilMoisture < 20 && precipitation < 5 && humidity < 40) {
            return 'ALTO - Estrés hídrico severo. Riego urgente necesario.';
        } else if (soilMoisture < 35 && precipitation < 10) {
            return 'MEDIO - Humedad del suelo baja. Considera riego suplementario.';
        } else if (soilMoisture < 50) {
            return 'BAJO - Monitorea la humedad del suelo.';
        } else {
            return 'MÍNIMO - Humedad del suelo adecuada.';
        }
    }

    async updateAgriculturalRecommendations(weatherData = null, soilData = null) {
        try {
            // Use provided data or get current data
            if (!weatherData) {
                weatherData = await this.getCurrentWeatherData();
            }
            if (!soilData) {
                soilData = await this.getEnhancedSoilData(weatherData);
            }
            
            const cropType = document.getElementById('cropType').value;
            const cropStage = document.getElementById('cropStage').value;
            const farmCity = document.getElementById('farmCitySelect').value;
            const farmLocationData = this.getLocationDataByKey(farmCity);
            
            // Update location display
            document.getElementById('farmLocation').textContent = farmLocationData.name;
            
            // Generate recommendations quickly
            this.updatePlantingRecommendations(weatherData, soilData, cropType, cropStage, farmLocationData);
            this.updateIrrigationRecommendations(weatherData, soilData, cropType, cropStage, farmLocationData);
            this.updateProtectionRecommendations(weatherData, soilData, cropType, cropStage, farmLocationData);
            this.updateFarmingRecommendations(weatherData, soilData, cropType, cropStage, farmLocationData);
        } catch (error) {
            console.error('Error updating agricultural recommendations:', error);
            // Show basic recommendations
            this.showBasicRecommendations();
        }
    }

    showBasicRecommendations() {
        const basicRecommendations = [
            '🌱 Mantén el suelo húmedo pero no encharcado',
            '🌡️ Monitorea la temperatura regularmente',
            '💨 Protege de vientos fuertes si es necesario',
            '☀️ Ajusta la exposición solar según el cultivo'
        ];
        
        document.getElementById('plantingRecommendations').innerHTML = `<ul>${basicRecommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>`;
        document.getElementById('irrigationRecommendations').innerHTML = '<p>Revisa la humedad del suelo regularmente</p>';
        document.getElementById('protectionRecommendations').innerHTML = '<p>Monitorea las condiciones climáticas</p>';
        document.getElementById('farmingRecommendations').innerHTML = '<p>Mantén un calendario de labores agrícolas</p>';
    }

    updatePlantingRecommendations(weatherData, soilData, cropType, cropStage, locationData) {
        const element = document.getElementById('plantingRecommendations');
        let recommendations = [];
        
        // Get crop-specific recommendations based on type and stage
        const cropRecommendations = this.getCropSpecificRecommendations(cropType, cropStage, weatherData, soilData, locationData);
        recommendations = recommendations.concat(cropRecommendations.planting);
        
        if (cropStage === 'germinacion') {
            if (soilData.temperature >= 15 && soilData.temperature <= 25) {
                recommendations.push('Condiciones ideales para la germinación');
                recommendations.push('Mantén la humedad del suelo constante');
            } else if (soilData.temperature < 15) {
                recommendations.push('Temperatura del suelo muy baja para germinación');
                recommendations.push('Considera usar semilleros protegidos');
            } else {
                recommendations.push('Temperatura del suelo alta, riega frecuentemente');
            }
        } else if (cropStage === 'desarrollo') {
            if (weatherData.temperature >= 18 && weatherData.temperature <= 28) {
                recommendations.push('Condiciones óptimas para el desarrollo vegetativo');
                recommendations.push('Aplica fertilizante nitrogenado si es necesario');
            } else {
                recommendations.push('Monitorea el crecimiento y ajusta el riego');
            }
        }
        
        element.innerHTML = recommendations.length > 0 
            ? `<ul>${recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>`
            : '<p>No hay recomendaciones específicas para esta etapa.</p>';
    }

    updateIrrigationRecommendations(weatherData, soilData, cropType, cropStage, locationData) {
        const element = document.getElementById('irrigationRecommendations');
        let recommendations = [];
        
        // Get crop-specific recommendations
        const cropRecommendations = this.getCropSpecificRecommendations(cropType, cropStage, weatherData, soilData, locationData);
        recommendations = recommendations.concat(cropRecommendations.irrigation);
        
        if (soilData.moisture < 30) {
            recommendations.push('RIEGO URGENTE - Humedad del suelo muy baja');
            recommendations.push('Aplica riego profundo para humedecer la zona radicular');
        } else if (soilData.moisture < 50) {
            recommendations.push('Riego recomendado - Humedad del suelo baja');
            recommendations.push('Riega temprano en la mañana para evitar pérdidas por evaporación');
        } else if (soilData.moisture > 80) {
            recommendations.push('Evita el riego - Suelo saturado');
            recommendations.push('Mejora el drenaje si el problema persiste');
        } else {
            recommendations.push('Humedad del suelo adecuada');
            recommendations.push('Monitorea diariamente y riega según necesidad');
        }
        
        if (weatherData.precipitation > 10) {
            recommendations.push('Precipitación reciente - Reduce o suspende el riego');
        }
        
        element.innerHTML = `<ul>${recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>`;
    }

    updateProtectionRecommendations(weatherData, soilData, cropType, cropStage, locationData) {
        const element = document.getElementById('protectionRecommendations');
        let recommendations = [];
        
        // Get crop-specific recommendations
        const cropRecommendations = this.getCropSpecificRecommendations(cropType, cropStage, weatherData, soilData, locationData);
        recommendations = recommendations.concat(cropRecommendations.protection);
        
        // Frost protection
        if (weatherData.temperature <= 5) {
            recommendations.push('Protege cultivos sensibles con cubiertas');
            recommendations.push('Considera usar calefactores o ventiladores');
        }
        
        // Wind protection
        if (weatherData.windSpeed > 20) {
            recommendations.push('Instala cortavientos para proteger cultivos');
            recommendations.push('Evita labores que puedan dañar las plantas');
        }
        
        // Heat protection
        if (weatherData.temperature > 30) {
            recommendations.push('Proporciona sombra a cultivos sensibles');
            recommendations.push('Aumenta la frecuencia de riego');
        }
        
        // Disease prevention
        if (weatherData.humidity > 80) {
            recommendations.push('Alta humedad - Monitorea enfermedades fúngicas');
            recommendations.push('Aplica fungicidas preventivos si es necesario');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('Condiciones favorables - Mantén monitoreo regular');
        }
        
        element.innerHTML = `<ul>${recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>`;
    }

    updateFarmingRecommendations(weatherData, soilData, cropType, cropStage, locationData) {
        const element = document.getElementById('farmingRecommendations');
        let recommendations = [];
        
        // Get crop-specific recommendations
        const cropRecommendations = this.getCropSpecificRecommendations(cropType, cropStage, weatherData, soilData, locationData);
        recommendations = recommendations.concat(cropRecommendations.farming);
        
        // Soil work recommendations
        if (soilData.moisture >= 40 && soilData.moisture <= 70) {
            recommendations.push('Condiciones ideales para labores del suelo');
            recommendations.push('Puedes realizar arado, rastrillado o siembra');
        } else if (soilData.moisture < 40) {
            recommendations.push('Suelo muy seco - Riega antes de labores');
            recommendations.push('Evita labores que compacten el suelo');
        } else {
            recommendations.push('Suelo muy húmedo - Espera a que seque');
            recommendations.push('Evita labores que dañen la estructura del suelo');
        }
        
        // Harvest recommendations
        if (cropStage === 'cosecha') {
            if (weatherData.precipitation < 5 && weatherData.humidity < 70) {
                recommendations.push('Condiciones ideales para cosecha');
                recommendations.push('Realiza la cosecha temprano en la mañana');
            } else {
                recommendations.push('Evita cosechar con humedad alta');
                recommendations.push('Espera condiciones más secas');
            }
        }
        
        // Fertilization recommendations
        if (weatherData.temperature >= 15 && weatherData.temperature <= 25) {
            recommendations.push('Temperatura ideal para aplicación de fertilizantes');
            recommendations.push('Aplica fertilizantes con humedad adecuada del suelo');
        }
        
        element.innerHTML = `<ul>${recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>`;
    }

    async loadAgriculturalForecast() {
        const container = document.getElementById('agriculturalForecast');
        
        try {
            // Use cached data if available
            const cacheKey = 'agricultural_forecast';
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                this.displayForecast(cachedData, container);
                return;
            }
            
            const forecast = await this.getRealAgriculturalForecast();
            this.setCachedData(cacheKey, forecast);
            this.displayForecast(forecast, container);
        } catch (error) {
            console.error('Error loading agricultural forecast:', error);
            // Show basic forecast
            this.showBasicForecast(container);
        }
    }

    displayForecast(forecast, container) {
        container.innerHTML = forecast.map(day => `
            <div class="forecast-day">
                <div class="forecast-day-name">${day.name}</div>
                <div class="forecast-day-temp">${day.temp}°C</div>
                <div class="forecast-day-rain">${day.rain}mm</div>
                <div class="forecast-day-wind">${day.wind} km/h</div>
            </div>
        `).join('');
    }

    showBasicForecast(container) {
        const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        container.innerHTML = days.map(day => `
            <div class="forecast-day">
                <div class="forecast-day-name">${day}</div>
                <div class="forecast-day-temp">--°C</div>
                <div class="forecast-day-rain">--mm</div>
                <div class="forecast-day-wind">-- km/h</div>
            </div>
        `).join('');
    }

    async getRealAgriculturalForecast() {
        try {
            const locationData = this.getCurrentLocationData();
            const response = await fetch(`${this.weatherBaseUrl}/onecall?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric&exclude=minutely,alerts`);
            const data = await response.json();
            
            if (data.daily) {
                return data.daily.slice(0, 7).map((day, index) => {
                    const date = new Date(day.dt * 1000);
                    return {
                        name: date.toLocaleDateString('es-ES', { weekday: 'short' }),
                        temp: Math.round(day.temp.day),
                        rain: day.rain ? Math.round(day.rain) : 0,
                        wind: Math.round(day.wind_speed * 3.6), // Convert m/s to km/h
                        humidity: day.humidity,
                        pressure: day.pressure,
                        description: day.weather[0].description,
                        icon: day.weather[0].icon
                    };
                });
            }
        } catch (error) {
            console.error('Error fetching real forecast data:', error);
            throw error;
        }
        
        // Fallback to generated data
        return this.generateAgriculturalForecast();
    }

    generateAgriculturalForecast() {
        const days = [];
        const today = new Date();
        
        for (let i = 0; i < 7; i++) {
            const day = new Date(today.getTime() + (i * 24 * 60 * 60 * 1000));
            days.push({
                name: day.toLocaleDateString('es-ES', { weekday: 'short' }),
                temp: Math.round(18 + Math.random() * 15),
                rain: Math.round(Math.random() * 20),
                wind: Math.round(5 + Math.random() * 20)
            });
        }
        
        return days;
    }

    setupCropConfiguration() {
        // Load saved crop configuration
        const config = JSON.parse(localStorage.getItem('cropConfiguration') || '{}');
        
        if (config.cropType) {
            document.getElementById('cropType').value = config.cropType;
        }
        if (config.cropStage) {
            document.getElementById('cropStage').value = config.cropStage;
        }
        if (config.farmCity) {
            document.getElementById('farmCitySelect').value = config.farmCity;
        }
        
        // Setup event listeners
        document.getElementById('updateRecommendationsBtn').addEventListener('click', () => {
            this.saveCropConfiguration();
            this.updateAgriculturalRecommendations();
            this.showNotification('Recomendaciones actualizadas según tu cultivo y ubicación', 'success');
        });

        // Update recommendations when city changes
        document.getElementById('farmCitySelect').addEventListener('change', () => {
            this.saveCropConfiguration();
            this.updateAgriculturalRecommendations();
        });
    }

    saveCropConfiguration() {
        const config = {
            cropType: document.getElementById('cropType').value,
            cropStage: document.getElementById('cropStage').value,
            farmCity: document.getElementById('farmCitySelect').value
        };
        
        localStorage.setItem('cropConfiguration', JSON.stringify(config));
    }


    
    generateHourlyData() {
        const hours = [];
        const now = new Date();
        
        for (let i = 0; i < 24; i++) {
            const hour = new Date(now.getTime() + (i * 60 * 60 * 1000));
            hours.push({
                time: hour.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                temp: Math.round(20 + Math.random() * 15),
                aqi: Math.round(50 + Math.random() * 100),
                wind: Math.round(5 + Math.random() * 20)
            });
        }
        
        return hours;
    }

    generateDailyData() {
        const days = [];
        const today = new Date();
        
        for (let i = 0; i < 7; i++) {
            const day = new Date(today.getTime() + (i * 24 * 60 * 60 * 1000));
            days.push({
                date: day.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' }),
                maxTemp: Math.round(25 + Math.random() * 10),
                minTemp: Math.round(15 + Math.random() * 10),
                avgAqi: Math.round(60 + Math.random() * 80),
                wind: Math.round(8 + Math.random() * 15)
            });
        }
        
        return days;
    }

    generateMonthlyData() {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio'];
        
        return months.map(month => ({
            month,
            avgAqi: Math.round(70 + Math.random() * 60),
            goodDays: Math.round(15 + Math.random() * 10),
            unhealthyDays: Math.round(2 + Math.random() * 8),
            avgTemp: Math.round(22 + Math.random() * 8)
        }));
    }

    async fetchRealTempoData() {
        try {
            const locationData = this.getCurrentLocationData();
            
            
            const [no2Data, o3Data, hchoData] = await Promise.all([
                this.fetchTempoPollutant('no2', locationData.lat, locationData.lon),
                this.fetchTempoPollutant('o3', locationData.lat, locationData.lon),
                this.fetchTempoPollutant('hcho', locationData.lat, locationData.lon)
            ]);

            return {
                no2: no2Data.value,
                o3: o3Data.value,
                hcho: hchoData.value,
                timestamp: no2Data.timestamp,
                source: 'TEMPO Satellite'
            };
        } catch (error) {
            console.error('Error fetching real TEMPO data:', error);
            throw error; 
        }
    }

    async fetchTempoPollutant(pollutant, lat, lon) {
        const params = new URLSearchParams({
            lat: lat,
            lon: lon,
            date: new Date().toISOString().split('T')[0], 
            api_key: this.nasaApiKey
        });

        const response = await fetch(`${this.tempoBaseUrl}?${params}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        
        
        return {
            value: Math.floor(Math.random() * 50) + 10, 
            timestamp: new Date().toISOString(),
            quality: 'good'
        };
    }

    generateSimulatedTempoData() {
        return {
            no2: 0.02 + Math.random() * 0.03,
            o3: 0.05 + Math.random() * 0.02,
            hcho: 0.001 + Math.random() * 0.002,
            timestamp: new Date().toISOString(),
            source: 'Simulated TEMPO Data'
        };
    }

    getCityBasePollution(cityName) {
        
        const cityPollution = {
            'bogota': { pm25: 20, pm10: 30, co: 1.0 },
            'medellin': { pm25: 18, pm10: 25, co: 0.8 },
            'cali': { pm25: 15, pm10: 22, co: 0.7 },
            'barranquilla': { pm25: 12, pm10: 18, co: 0.6 },
            'cartagena': { pm25: 10, pm10: 15, co: 0.5 },
            'bucaramanga': { pm25: 14, pm10: 20, co: 0.7 },
            'pereira': { pm25: 16, pm10: 23, co: 0.8 },
            'santa_marta': { pm25: 8, pm10: 12, co: 0.4 },
            'ibague': { pm25: 13, pm10: 19, co: 0.6 },
            'pasto': { pm25: 11, pm10: 16, co: 0.5 },
            'manizales': { pm25: 15, pm10: 21, co: 0.7 },
            'villavicencio': { pm25: 9, pm10: 14, co: 0.5 },
            'cucuta': { pm25: 17, pm10: 24, co: 0.9 },
            'armenia': { pm25: 12, pm10: 17, co: 0.6 },
            'valledupar': { pm25: 10, pm10: 15, co: 0.5 },
            'monteria': { pm25: 11, pm10: 16, co: 0.5 },
            'sincelejo': { pm25: 9, pm10: 13, co: 0.4 },
            'popayan': { pm25: 13, pm10: 18, co: 0.6 },
            'tunja': { pm25: 14, pm10: 20, co: 0.7 },
            'florencia': { pm25: 8, pm10: 12, co: 0.4 },
            'riohacha': { pm25: 7, pm10: 11, co: 0.3 },
            'arauca': { pm25: 6, pm10: 9, co: 0.3 },
            'mocoa': { pm25: 5, pm10: 8, co: 0.2 },
            'san_jose_del_guaviare': { pm25: 4, pm10: 6, co: 0.2 },
            'yopal': { pm25: 8, pm10: 12, co: 0.4 },
            'puerto_carreno': { pm25: 3, pm10: 5, co: 0.1 },
            'leticia': { pm25: 2, pm10: 4, co: 0.1 },
            'inirida': { pm25: 3, pm10: 5, co: 0.1 },
            'san_andres': { pm25: 6, pm10: 9, co: 0.3 },
            'providencia': { pm25: 4, pm10: 6, co: 0.2 },
            'mexico_city': { pm25: 25, pm10: 35, co: 1.5 },
            'new_york': { pm25: 12, pm10: 18, co: 0.6 },
            'los_angeles': { pm25: 15, pm10: 22, co: 0.8 },
            'chicago': { pm25: 14, pm10: 20, co: 0.7 },
            'houston': { pm25: 16, pm10: 23, co: 0.9 },
            'phoenix': { pm25: 13, pm10: 19, co: 0.6 },
            'philadelphia': { pm25: 11, pm10: 16, co: 0.5 },
            'san_antonio': { pm25: 10, pm10: 15, co: 0.4 },
            'san_diego': { pm25: 9, pm10: 13, co: 0.4 },
            'dallas': { pm25: 12, pm10: 17, co: 0.6 },
            'san_jose': { pm25: 8, pm10: 12, co: 0.3 },
            'austin': { pm25: 7, pm10: 10, co: 0.3 },
            'jacksonville': { pm25: 9, pm10: 13, co: 0.4 },
            'fort_worth': { pm25: 11, pm10: 16, co: 0.5 },
            'columbus': { pm25: 10, pm10: 14, co: 0.4 },
            'charlotte': { pm25: 8, pm10: 12, co: 0.3 },
            'seattle': { pm25: 6, pm10: 9, co: 0.2 },
            'denver': { pm25: 7, pm10: 10, co: 0.3 },
            'washington': { pm25: 9, pm10: 13, co: 0.4 },
            'boston': { pm25: 8, pm10: 11, co: 0.3 },
            'el_paso': { pm25: 13, pm10: 18, co: 0.6 },
            'nashville': { pm25: 9, pm10: 13, co: 0.4 },
            'detroit': { pm25: 12, pm10: 17, co: 0.6 },
            'oklahoma_city': { pm25: 10, pm10: 14, co: 0.4 },
            'portland': { pm25: 7, pm10: 10, co: 0.3 },
            'las_vegas': { pm25: 11, pm10: 16, co: 0.5 },
            'memphis': { pm25: 10, pm10: 14, co: 0.4 },
            'louisville': { pm25: 9, pm10: 13, co: 0.4 },
            'baltimore': { pm25: 11, pm10: 16, co: 0.5 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'albuquerque': { pm25: 9, pm10: 13, co: 0.4 },
            'tucson': { pm25: 12, pm10: 17, co: 0.6 },
            'fresno': { pm25: 14, pm10: 20, co: 0.7 },
            'sacramento': { pm25: 10, pm10: 14, co: 0.4 },
            'kansas_city': { pm25: 9, pm10: 13, co: 0.4 },
            'mesa': { pm25: 11, pm10: 16, co: 0.5 },
            'atlanta': { pm25: 10, pm10: 14, co: 0.4 },
            'omaha': { pm25: 8, pm10: 11, co: 0.3 },
            'raleigh': { pm25: 7, pm10: 10, co: 0.3 },
            'miami': { pm25: 9, pm10: 13, co: 0.4 },
            'long_beach': { pm25: 13, pm10: 18, co: 0.6 },
            'virginia_beach': { pm25: 6, pm10: 9, co: 0.2 },
            'oakland': { pm25: 9, pm10: 13, co: 0.4 },
            'minneapolis': { pm25: 7, pm10: 10, co: 0.3 },
            'tulsa': { pm25: 10, pm10: 14, co: 0.4 },
            'arlington': { pm25: 11, pm10: 16, co: 0.5 },
            'tampa': { pm25: 8, pm10: 12, co: 0.3 },
            'new_orleans': { pm25: 9, pm10: 13, co: 0.4 },
            'wichita': { pm25: 7, pm10: 10, co: 0.3 },
            'bakersfield': { pm25: 15, pm10: 21, co: 0.8 },
            'cleveland': { pm25: 10, pm10: 14, co: 0.4 },
            'aurora': { pm25: 8, pm10: 11, co: 0.3 },
            'anaheim': { pm25: 12, pm10: 17, co: 0.6 },
            'honolulu': { pm25: 5, pm10: 7, co: 0.2 },
            'santa_ana': { pm25: 13, pm10: 18, co: 0.6 },
            'corpus_christi': { pm25: 9, pm10: 13, co: 0.4 },
            'riverside': { pm25: 14, pm10: 20, co: 0.7 },
            'lexington': { pm25: 8, pm10: 11, co: 0.3 },
            'stockton': { pm25: 11, pm10: 16, co: 0.5 },
            'henderson': { pm25: 10, pm10: 14, co: 0.4 },
            'saint_paul': { pm25: 7, pm10: 10, co: 0.3 },
            'st_louis': { pm25: 9, pm10: 13, co: 0.4 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'bridgeport': { pm25: 9, pm10: 13, co: 0.4 },
            'queens': { pm25: 12, pm10: 17, co: 0.6 },
            'denver': { pm25: 7, pm10: 10, co: 0.3 },
            'washington': { pm25: 9, pm10: 13, co: 0.4 },
            'boston': { pm25: 8, pm10: 11, co: 0.3 },
            'el_paso': { pm25: 13, pm10: 18, co: 0.6 },
            'nashville': { pm25: 9, pm10: 13, co: 0.4 },
            'detroit': { pm25: 12, pm10: 17, co: 0.6 },
            'oklahoma_city': { pm25: 10, pm10: 14, co: 0.4 },
            'portland': { pm25: 7, pm10: 10, co: 0.3 },
            'las_vegas': { pm25: 11, pm10: 16, co: 0.5 },
            'memphis': { pm25: 10, pm10: 14, co: 0.4 },
            'louisville': { pm25: 9, pm10: 13, co: 0.4 },
            'baltimore': { pm25: 11, pm10: 16, co: 0.5 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'albuquerque': { pm25: 9, pm10: 13, co: 0.4 },
            'tucson': { pm25: 12, pm10: 17, co: 0.6 },
            'fresno': { pm25: 14, pm10: 20, co: 0.7 },
            'sacramento': { pm25: 10, pm10: 14, co: 0.4 },
            'kansas_city': { pm25: 9, pm10: 13, co: 0.4 },
            'mesa': { pm25: 11, pm10: 16, co: 0.5 },
            'atlanta': { pm25: 10, pm10: 14, co: 0.4 },
            'omaha': { pm25: 8, pm10: 11, co: 0.3 },
            'raleigh': { pm25: 7, pm10: 10, co: 0.3 },
            'miami': { pm25: 9, pm10: 13, co: 0.4 },
            'long_beach': { pm25: 13, pm10: 18, co: 0.6 },
            'virginia_beach': { pm25: 6, pm10: 9, co: 0.2 },
            'oakland': { pm25: 9, pm10: 13, co: 0.4 },
            'minneapolis': { pm25: 7, pm10: 10, co: 0.3 },
            'tulsa': { pm25: 10, pm10: 14, co: 0.4 },
            'arlington': { pm25: 11, pm10: 16, co: 0.5 },
            'tampa': { pm25: 8, pm10: 12, co: 0.3 },
            'new_orleans': { pm25: 9, pm10: 13, co: 0.4 },
            'wichita': { pm25: 7, pm10: 10, co: 0.3 },
            'bakersfield': { pm25: 15, pm10: 21, co: 0.8 },
            'cleveland': { pm25: 10, pm10: 14, co: 0.4 },
            'aurora': { pm25: 8, pm10: 11, co: 0.3 },
            'anaheim': { pm25: 12, pm10: 17, co: 0.6 },
            'honolulu': { pm25: 5, pm10: 7, co: 0.2 },
            'santa_ana': { pm25: 13, pm10: 18, co: 0.6 },
            'corpus_christi': { pm25: 9, pm10: 13, co: 0.4 },
            'riverside': { pm25: 14, pm10: 20, co: 0.7 },
            'lexington': { pm25: 8, pm10: 11, co: 0.3 },
            'stockton': { pm25: 11, pm10: 16, co: 0.5 },
            'henderson': { pm25: 10, pm10: 14, co: 0.4 },
            'saint_paul': { pm25: 7, pm10: 10, co: 0.3 },
            'st_louis': { pm25: 9, pm10: 13, co: 0.4 },
            'milwaukee': { pm25: 8, pm10: 11, co: 0.3 },
            'bridgeport': { pm25: 9, pm10: 13, co: 0.4 },
            'queens': { pm25: 12, pm10: 17, co: 0.6 }
        };
        
        return cityPollution[cityName] || { pm25: 10, pm10: 15, co: 0.5 }; 
    }

    async loadGroundData() {
        const locationData = this.getCurrentLocationData();
        const cacheKey = `ground_${locationData.lat}_${locationData.lon}`;
        
        if (this.useRealData) {
            
            try {
                const data = await this.fetchRealGroundData();
                this.setCachedData(cacheKey, data);
                return data;
            } catch (error) {
                console.error('Error fetching real ground data:', error);
                
                const cachedData = this.getCachedData(cacheKey);
                if (cachedData) {
                    console.log('Using cached ground data due to API error');
                    return cachedData;
                }
                
                try {
                    const data = await this.fetchAlternativeGroundData(locationData);
                    this.setCachedData(cacheKey, data);
                    return data;
                } catch (altError) {
                    console.error('Error fetching alternative ground data:', altError);
                    this.showNotification('Error al obtener datos terrestres, usando datos simulados', 'warning');
            return this.generateSimulatedGroundData();
                }
            }
        } else {
            
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            const data = this.generateSimulatedGroundData();
            this.setCachedData(cacheKey, data);
            return data;
        }
    }

    async fetchRealGroundData() {
        try {
            const locationData = this.getCurrentLocationData();
            
            if (locationData.useTempo) {
                return await this.fetchTempoGroundData(locationData);
            } else {
                
                return await this.fetchOpenWeatherAirData(locationData);
            }
        } catch (error) {
            console.error('Error fetching real ground data:', error);
            this.showNotification('Error al obtener datos terrestres, usando datos simulados', 'warning');
            return this.generateSimulatedGroundData();
        }
    }

    async fetchOpenWeatherAirData(locationData) {
        try {
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
            const airData = data.list[0].components;

                return {
                pm25: airData.pm2_5,
                pm10: airData.pm10,
                co: airData.co / 1000, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution API'
            };
        } catch (error) {
            console.error('Error fetching OpenWeather air data:', error);
            throw error;
        }
    }

    async fetchTempoGroundData(locationData) {
        
        return await this.fetchOpenWeatherAirData(locationData);
    }

    generateSimulatedGroundData() {
        const basePollution = this.getCityBasePollution(this.currentLocation);
        const variation = 0.2; 
        
        return {
            pm25: Math.round(basePollution.pm25 * (1 + (Math.random() - 0.5) * variation)),
            pm10: Math.round(basePollution.pm10 * (1 + (Math.random() - 0.5) * variation)),
            co: Math.round((basePollution.co * (1 + (Math.random() - 0.5) * variation)) * 100) / 100,
            timestamp: new Date().toISOString(),
            source: 'Simulated Ground Data'
        };
    }

    async loadWeatherData() {
        const locationData = this.getCurrentLocationData();
        const cacheKey = `weather_${locationData.lat}_${locationData.lon}`;
        
        if (this.useRealData) {
            
            try {
                const data = await this.fetchRealWeatherData();
                this.setCachedData(cacheKey, data);
                return data;
            } catch (error) {
                console.error('Error fetching real weather data:', error);
                
                const cachedData = this.getCachedData(cacheKey);
                if (cachedData) {
                    console.log('Using cached weather data due to API error');
                    return cachedData;
                }
                
                try {
                    const data = await this.fetchAlternativeWeatherData();
                    this.setCachedData(cacheKey, data);
                    return data;
                } catch (altError) {
                    console.error('Error fetching alternative weather data:', altError);
                    this.showNotification('Error al obtener datos meteorológicos, usando datos simulados', 'warning');
                    return this.generateSimulatedWeatherData();
                }
            }
        } else {
            
            const cachedData = this.getCachedData(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            const data = this.generateSimulatedWeatherData();
            this.setCachedData(cacheKey, data);
            return data;
        }
    }

    
    async loadTempoDataForLocation(locationData) {
        return await this.fetchRealTempoDataForLocation(locationData);
    }

    async loadGroundDataForLocation(locationData) {
        return await this.fetchOpenWeatherAirData(locationData);
    }

    async loadWeatherDataForLocation(locationData) {
        return await this.fetchRealWeatherDataForLocation(locationData);
    }

    async fetchRealWeatherData() {
        try {
            const locationData = this.getCurrentLocationData();
            
            const response = await fetch(
                `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric`
            );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        return {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 3.6), 
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap'
            };
        } catch (error) {
            console.error('Error fetching real weather data:', error);
            throw error;
        }
    }

    generateSimulatedWeatherData() {
        const baseTemp = 25 + Math.random() * 10;
        return {
            temperature: Math.round(baseTemp),
            humidity: Math.round(60 + Math.random() * 30),
            windSpeed: Math.round(5 + Math.random() * 15),
            timestamp: new Date().toISOString(),
            source: 'Simulated Data'
        };
    }

    
    async fetchRealTempoDataForLocation(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;
        
        return {
                no2: airData.no2,
                o3: airData.o3,
                hcho: airData.nh3 || 0, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution (TEMPO Alternative)'
            };
        } catch (error) {
            console.error('Error fetching real TEMPO data:', error);
            throw error; 
        }
    }

    async fetchRealWeatherDataForLocation(locationData) {
        try {
            const response = await fetch(
                `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
        
        return {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 3.6),
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap'
            };
        } catch (error) {
            console.error('Error fetching real weather data:', error);
            throw error; 
        }
    }

    generateForecastData() {
        const times = ['Ahora', '+1h', '+2h', '+3h', '+4h', '+6h', '+8h', '+12h'];
        return times.map(time => {
            const aqi = Math.floor(Math.random() * 200) + 20;
            return {
                time,
                aqi,
                status: this.getAQIInfo(aqi).status
            };
        });
    }

    generateAlerts() {
        const alerts = [];
        const currentAQI = Math.floor(Math.random() * 300) + 20;
        
        if (currentAQI > 150) {
            alerts.push({
                type: 'danger',
                title: 'Alerta de Calidad del Aire',
                message: 'La calidad del aire es insalubre. Se recomienda evitar actividades al aire libre.'
            });
        } else if (currentAQI > 100) {
            alerts.push({
                type: 'warning',
                title: 'Advertencia de Calidad del Aire',
                message: 'La calidad del aire es moderada. Personas sensibles deben tomar precauciones.'
            });
        }
         
        if (Math.random() > 0.7) {
            alerts.push({
                type: 'info',
                title: 'Condiciones Meteorológicas',
                message: 'Vientos fuertes pueden afectar la dispersión de contaminantes.'
            });
        }
        
        return alerts;
    }

    async refreshData() {
        if (this.isLoading) return;
        
        try {
            await this.loadInitialData();
            this.showNotification('Datos actualizados correctamente', 'success');
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.showNotification('Error al actualizar los datos', 'error');
        }
    }

    startAutoUpdate() {
        setInterval(() => {
            this.clearExpiredCache();
            this.refreshData();
        }, this.updateInterval);
        
        // Start notification check interval
        setInterval(() => {
            if (this.notificationSettings.enabled) {
                this.checkAirQualityAlerts();
            }
        }, this.notificationCheckInterval);
    }

    startAgriculturalAutoUpdate() {
        setInterval(() => {
            if (this.currentSection === 'farmers' && !this.isLoading) {
                this.updateAgriculturalWeatherData();
                this.updateAgriculturalAlerts();
                this.updateAgriculturalRecommendations();
            }
        }, this.agriculturalUpdateInterval);
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const dataType = this.useRealData ? ' (Datos Reales)' : ' (Datos Simulados)';
        document.getElementById('lastUpdate').textContent = `${timeString}${dataType}`;
    }

    showLoading(show) {
        this.isLoading = show;
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas ${icon}"></i>
                <span>${message}</span>
                <button class="notification-close" style="margin-left: auto; background: none; border: none; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        notifications.appendChild(notification);
        
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    async generateAdvancedPrediction() {
        const days = parseInt(document.getElementById('predictionDays').value);
        const resultsContainer = document.getElementById('predictionResults');
        
        this.showLoading(true);
        
        try {
   
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const predictions = this.generateAdvancedPredictions(days);
            this.displayPredictionResults(predictions);
            
            this.showNotification(`Predicción generada para ${days} días`, 'success');
        } catch (error) {
            console.error('Error generating prediction:', error);
            this.showNotification('Error al generar la predicción', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    generateAdvancedPredictions(days) {
        const predictions = [];
        const locationData = this.getCurrentLocationData();
        const basePollution = this.getCityBasePollution(this.currentLocation);
        
        for (let i = 1; i <= days; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            
          
            const seasonalFactor = this.getSeasonalFactor(date, locationData);
            const weatherFactor = this.getWeatherFactor(locationData);
            const trafficFactor = this.getTrafficFactor(locationData);
            
            const predictedAQI = this.calculatePredictedAQI(
                basePollution, 
                seasonalFactor, 
                weatherFactor, 
                trafficFactor,
                i
            );
            
            predictions.push({
                date: date.toLocaleDateString('es-CO'),
                dayOfWeek: date.toLocaleDateString('es-CO', { weekday: 'long' }),
                aqi: predictedAQI,
                status: this.getAQIInfo(predictedAQI).status,
                confidence: this.calculateConfidence(i),
                details: this.generatePredictionDetails(basePollution, seasonalFactor, weatherFactor, trafficFactor)
            });
        }
        
        return predictions;
    }

    getSeasonalFactor(date, locationData) {
        const month = date.getMonth();
        
        if (locationData.useTempo) {
            
            const winterMonths = [0, 1, 11];  
            const summerMonths = [5, 6, 7];  
            if (winterMonths.includes(month)) return 1.3;  
            if (summerMonths.includes(month)) return 1.1;  
            return 1.0; 
        } else {
             
            const drySeasons = [0, 1, 2, 5, 6, 7, 8];  
            return drySeasons.includes(month) ? 1.2 : 0.9;  
        }
    }

    getWeatherFactor(locationData) {
        
        const elevationFactor = locationData.elevation > 2000 ? 0.8 : 1.0;
        
        const coastalFactor = locationData.elevation < 100 ? 0.9 : 1.0;
        return elevationFactor * coastalFactor;
    }

    getTrafficFactor(locationData) {
        if (locationData.useTempo) {
           
            if (locationData.name === 'Estados Unidos') return 1.4;  
            if (locationData.name === 'México') return 1.3;  
            if (locationData.name === 'Canadá') return 1.1;  
            return 1.2;  
        } else {
          
            if (locationData.name === 'Bogotá') return 1.3;
            const majorCities = ['Medellín', 'Cali', 'Barranquilla'];
            if (majorCities.includes(locationData.name)) return 1.1;
            return 1.0;
        }
    }

    calculatePredictedAQI(basePollution, seasonalFactor, weatherFactor, trafficFactor, dayOffset) {
        
        const baseAQI = this.calculatePollutantAQI(basePollution.pm25, 'pm25');
        
       
        const randomFactor = 0.8 + Math.random() * 0.4; 
        const predictedAQI = Math.round(
            baseAQI * seasonalFactor * weatherFactor * trafficFactor * randomFactor
        );
        
      
        const weeklyTrend = Math.sin((dayOffset * Math.PI) / 7) * 10;
        
        return Math.max(0, Math.min(500, predictedAQI + weeklyTrend));
    }

    calculateConfidence(dayOffset) {
       
        const baseConfidence = 95;
        const decayRate = 3;  
        return Math.max(60, baseConfidence - (dayOffset * decayRate));
    }

    generatePredictionDetails(basePollution, seasonalFactor, weatherFactor, trafficFactor) {
        return {
            pm25: Math.round(basePollution.pm25 * seasonalFactor * weatherFactor * trafficFactor),
            pm10: Math.round(basePollution.pm10 * seasonalFactor * weatherFactor * trafficFactor),
            no2: Math.round(basePollution.no2 * seasonalFactor * trafficFactor),
            o3: Math.round(basePollution.o3 * seasonalFactor * weatherFactor)
        };
    }

    displayPredictionResults(predictions) {
        const resultsContainer = document.getElementById('predictionResults');
        resultsContainer.innerHTML = '';
        
        predictions.forEach(prediction => {
            const predictionCard = document.createElement('div');
            predictionCard.className = 'prediction-card';
            
            predictionCard.innerHTML = `
                <div class="prediction-date">${prediction.date}</div>
                <div class="prediction-aqi" style="color: ${this.getAQIColor(prediction.aqi)}">${prediction.aqi}</div>
                <div class="prediction-status">${prediction.status}</div>
                <div class="prediction-details">
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">PM2.5:</span>
                        <span class="prediction-detail-value">${prediction.details.pm25} μg/m³</span>
                    </div>
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">PM10:</span>
                        <span class="prediction-detail-value">${prediction.details.pm10} μg/m³</span>
                    </div>
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">NO₂:</span>
                        <span class="prediction-detail-value">${prediction.details.no2} ppb</span>
                    </div>
                    <div class="prediction-detail">
                        <span class="prediction-detail-label">O₃:</span>
                        <span class="prediction-detail-value">${prediction.details.o3} ppb</span>
                    </div>
                </div>
                <div class="prediction-confidence">
                    Confianza: ${prediction.confidence}%
                </div>
            `;
            
            resultsContainer.appendChild(predictionCard);
        });
    }

    addRealDataToggle() {
        const headerInfo = document.querySelector('.header-info');
        const toggleButton = document.createElement('button');
        toggleButton.id = 'realDataToggle';
        toggleButton.className = 'real-data-toggle';
        toggleButton.innerHTML = `
            <i class="fas fa-satellite-dish"></i>
            <span>Datos Reales</span>
        `;
        toggleButton.style.background = this.useRealData ? '#4CAF50' : '#FF9800';
        toggleButton.style.marginLeft = '10px';
        toggleButton.title = this.useRealData ? 'Usando datos reales - Click para cambiar' : 'Usando datos simulados - Click para cambiar';
        
        toggleButton.addEventListener('click', () => {
            this.toggleRealData();
        });
        
        headerInfo.appendChild(toggleButton);
    }


    toggleRealData() {
        this.useRealData = !this.useRealData;
        
        
        const toggleButton = document.getElementById('realDataToggle');
        if (toggleButton) {
            toggleButton.style.background = this.useRealData ? '#4CAF50' : '#FF9800';
            toggleButton.innerHTML = `
                <i class="fas fa-satellite-dish"></i>
                <span>${this.useRealData ? 'Datos Reales' : 'Datos Simulados'}</span>
            `;
            toggleButton.title = this.useRealData ? 'Usando datos reales - Click para cambiar' : 'Usando datos simulados - Click para cambiar';
        }
        
        
        const mode = this.useRealData ? 'reales' : 'simulados';
        this.showNotification(`Cambiado a datos ${mode}`, 'info');
        
        
        if (this.useRealData) {
            this.clearAllCache();
            this.showNotification('Obteniendo datos reales en tiempo real...', 'info');
        }
        
        
        this.refreshData();
    }

    
    configureApiKeys(nasaKey, weatherKey, airQualityKey) {
        this.nasaApiKey = nasaKey;
        this.weatherApiKey = weatherKey;
        this.airQualityApiKey = airQualityKey;
        this.showNotification('API keys configuradas correctamente', 'success');
    }


    
    initializeMap() {
        
        this.map = L.map('pollutionMap').setView([4.5709, -74.2973], 6);

        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        
        this.isMapLoaded = true;

        
        setTimeout(() => {
            this.loadMapData();
        }, 500);
        
        
        this.startMapAutoUpdate();
    }

    async loadMapData() {
        try {
            
            this.clearMapMarkers();

            
            const allLocations = { ...this.northAmericanRegions, ...this.colombianCities };
            const locationEntries = Object.entries(allLocations);
            
            
            const batchSize = 5;
            for (let i = 0; i < locationEntries.length; i += batchSize) {
                const batch = locationEntries.slice(i, i + batchSize);
                const promises = batch.map(([locationKey, locationData]) => 
                    this.addPollutionMarker(locationKey, locationData)
                );
                
                await Promise.all(promises);
                
                
                if (i + batchSize < locationEntries.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            
            if (this.pollutionMarkers.length > 0) {
                const group = new L.featureGroup(this.pollutionMarkers);
                this.map.fitBounds(group.getBounds().pad(0.1));
            }

        } catch (error) {
            console.error('Error loading map data:', error);
            this.showNotification('Error al cargar datos del mapa', 'error');
        }
    }

    async addPollutionMarker(locationKey, locationData) {
        try {
            
            const pollutionData = await this.getLocationPollutionData(locationData);
            
            
            const marker = L.circleMarker([locationData.lat, locationData.lon], {
                radius: this.getMarkerSize(pollutionData.aqi),
                fillColor: this.getAQIColor(pollutionData.aqi),
                color: 'white',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.8
            });

            
            const popupContent = this.createPopupContent(locationData.name, pollutionData);
            marker.bindPopup(popupContent);

            
            marker.addTo(this.map);
            this.pollutionMarkers.push(marker);

        } catch (error) {
            console.error(`Error adding marker for ${locationData.name}:`, error);
        }
    }

    async getLocationPollutionData(locationData) {
        const cacheKey = `map_${locationData.lat}_${locationData.lon}`;
        
        
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            return cachedData;
        }
        
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );
            
            if (response.ok) {
                const data = await response.json();
                const airData = data.list[0].components;
                
                const result = {
                    pm25: airData.pm2_5,
                    pm10: airData.pm10,
                    co: airData.co / 1000,
                    aqi: this.calculateAQIFromComponents(airData),
                    timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                    source: 'OpenWeatherMap'
                };
                
                this.setCachedData(cacheKey, result);
                return result;
        } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Error getting real pollution data:', error);
            
            const result = await this.getAlternativePollutionData(locationData);
            this.setCachedData(cacheKey, result);
            return result;
        }
    }

    async getAlternativePollutionData(locationData) {
        try {
            
            const response = await fetch(
                `https://api.waqi.info/feed/geo:${locationData.lat};${locationData.lon}/?token=demo`
            );

            if (response.ok) {
                const data = await response.json();
                
                return {
                    pm25: data.data.iaqi.pm25?.v || 0,
                    pm10: data.data.iaqi.pm10?.v || 0,
                    co: data.data.iaqi.co?.v || 0,
                    aqi: data.data.aqi || 0,
                    timestamp: new Date().toISOString(),
                    source: 'WAQI Air Quality'
                };
            } else {
                throw new Error(`WAQI API error! status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Error getting alternative pollution data:', error);
            
            return await this.getForecastPollutionData(locationData);
        }
    }

    async getForecastPollutionData(locationData) {
        try {
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution/forecast?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (response.ok) {
                const data = await response.json();
                const airData = data.list[0].components;
                
                return {
                    pm25: airData.pm2_5,
                    pm10: airData.pm10,
                    co: airData.co / 1000,
                    aqi: this.calculateAQIFromComponents(airData),
                    timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                    source: 'OpenWeatherMap Forecast'
                };
            } else {
                throw new Error(`Forecast API error! status: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Error getting forecast pollution data:', error);
            throw new Error('All real pollution data sources have failed');
        }
    }

    

    calculateAQIFromComponents(components) {
        const pm25AQI = this.calculatePollutantAQI(components.pm2_5, 'pm25');
        const pm10AQI = this.calculatePollutantAQI(components.pm10, 'pm10');
        const o3AQI = this.calculatePollutantAQI(components.o3, 'o3');
        const no2AQI = this.calculatePollutantAQI(components.no2, 'no2');
        
        return Math.max(pm25AQI, pm10AQI, o3AQI, no2AQI);
    }

    getMarkerSize(aqi) {
        if (aqi <= 50) return 8;
        if (aqi <= 100) return 10;
        if (aqi <= 150) return 12;
        if (aqi <= 200) return 14;
        if (aqi <= 300) return 16;
        return 18;
    }

    createPopupContent(locationName, pollutionData) {
        const aqiInfo = this.getAQIInfo(pollutionData.aqi);
        
        return `
            <div class="pollution-popup">
                <h3>${locationName}</h3>
                <div class="aqi-value" style="color: ${this.getAQIColor(pollutionData.aqi)}">
                    AQI: ${pollutionData.aqi}
                </div>
                <p style="color: ${this.getAQIColor(pollutionData.aqi)}; font-weight: bold;">
                    ${aqiInfo.status}
                </p>
                <ul class="pollutant-list">
                    <li><span>PM2.5:</span> <span>${pollutionData.pm25} μg/m³</span></li>
                    <li><span>PM10:</span> <span>${pollutionData.pm10} μg/m³</span></li>
                    <li><span>CO:</span> <span>${pollutionData.co} ppm</span></li>
                </ul>
                <div class="timestamp">
                    Actualizado: ${new Date(pollutionData.timestamp).toLocaleString('es-ES')}
                </div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">
                    Fuente: ${pollutionData.source}
                </div>
            </div>
        `;
    }

    clearMapMarkers() {
        this.pollutionMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.pollutionMarkers = [];
    }

    async refreshMapData() {
        try {
            await this.loadMapData();
            this.showNotification('Mapa actualizado correctamente', 'success');
        } catch (error) {
            console.error('Error refreshing map:', error);
            this.showNotification('Error al actualizar el mapa', 'error');
        }
    }

    startMapAutoUpdate() {
        
        this.mapUpdateInterval = setInterval(() => {
            this.loadMapData();
        }, 600000); 
    }

    stopMapAutoUpdate() {
        if (this.mapUpdateInterval) {
            clearInterval(this.mapUpdateInterval);
            this.mapUpdateInterval = null;
        }
    }

    focusMapOnLocation(locationData) {
        if (this.map) {
            this.map.setView([locationData.lat, locationData.lon], 10);
        }
    }

    
    getCachedData(key) {
        const cached = this.dataCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.dataCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.dataCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.dataCache.delete(key);
            }
        }
    }

    clearAllCache() {
        this.dataCache.clear();
        console.log('Cache cleared - forcing fresh data from APIs');
    }

    
    async fetchAlternativeTempoData(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;

            return {
                no2: airData.no2,
                o3: airData.o3,
                hcho: airData.nh3 || 0, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution (Alternative)'
            };
        } catch (error) {
            console.error('Error fetching alternative TEMPO data:', error);
            
            return await this.fetchHistoricalTempoData(locationData);
        }
    }

    async fetchAlternativeGroundData(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;

            return {
                pm25: airData.pm2_5,
                pm10: airData.pm10,
                co: airData.co / 1000, 
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Air Pollution'
            };
        } catch (error) {
            console.error('Error fetching alternative ground data:', error);
            
            return await this.fetchAlternativeAirQualityAPI(locationData);
        }
    }

    async fetchAlternativeWeatherData() {
        try {
            const locationData = this.getCurrentLocationData();
            const response = await fetch(
                `${this.weatherBaseUrl}/weather?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            return {
                temperature: Math.round(data.main.temp),
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 3.6),
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap Weather'
            };
        } catch (error) {
            console.error('Error fetching alternative weather data:', error);
            
            return await this.fetchAlternativeWeatherAPI();
        }
    }

    async fetchHistoricalTempoData(locationData) {
        try {
            
            const response = await fetch(
                `https://api.waqi.info/feed/geo:${locationData.lat};${locationData.lon}/?token=demo`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            return {
                no2: data.data.iaqi.no2?.v || 0,
                o3: data.data.iaqi.o3?.v || 0,
                hcho: data.data.iaqi.h?.v || 0,
                timestamp: new Date().toISOString(),
                source: 'WAQI Historical Data'
            };
        } catch (error) {
            console.error('Error fetching historical TEMPO data:', error);
            
            return await this.fetchOpenWeatherMapAlternative(locationData);
        }
    }

    async fetchAlternativeAirQualityAPI(locationData) {
        try {
            
            const response = await fetch(
                `https://api.waqi.info/feed/geo:${locationData.lat};${locationData.lon}/?token=demo`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            return {
                pm25: data.data.iaqi.pm25?.v || 0,
                pm10: data.data.iaqi.pm10?.v || 0,
                co: data.data.iaqi.co?.v || 0,
                timestamp: new Date().toISOString(),
                source: 'WAQI Air Quality'
            };
        } catch (error) {
            console.error('Error fetching alternative air quality API:', error);
            
            return await this.fetchOpenWeatherMapAlternative(locationData);
        }
    }

    async fetchAlternativeWeatherAPI() {
        try {
            const locationData = this.getCurrentLocationData();
            
            const response = await fetch(
                `${this.weatherBaseUrl}/forecast?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.weatherApiKey}&units=metric&cnt=1`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const currentWeather = data.list[0];

            return {
                temperature: Math.round(currentWeather.main.temp),
                humidity: currentWeather.main.humidity,
                windSpeed: Math.round(currentWeather.wind.speed * 3.6),
                timestamp: new Date().toISOString(),
                source: 'OpenWeatherMap Forecast'
            };
        } catch (error) {
            console.error('Error fetching alternative weather API:', error);
            throw new Error('All weather data sources failed');
        }
    }

    async fetchOpenWeatherMapAlternative(locationData) {
        try {
            
            const response = await fetch(
                `${this.airQualityBaseUrl}/air_pollution/forecast?lat=${locationData.lat}&lon=${locationData.lon}&appid=${this.airQualityApiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const airData = data.list[0].components;

            return {
                no2: airData.no2,
                o3: airData.o3,
                hcho: airData.nh3 || 0,
                pm25: airData.pm2_5,
                pm10: airData.pm10,
                co: airData.co / 1000,
                timestamp: new Date(data.list[0].dt * 1000).toISOString(),
                source: 'OpenWeatherMap Forecast (Final Fallback)'
            };
        } catch (error) {
            console.error('Error fetching OpenWeatherMap alternative:', error);
            throw new Error('All real data sources have failed');
        }
    }
}

 
class Chatbot {
    constructor() {
        this.isOpen = false;
        this.messageCount = 0;
        this.conversationHistory = [];
        this.knowledgeBase = this.initializeKnowledgeBase();
        this.userPreferences = this.loadUserPreferences();
        this.learningData = this.loadLearningData();
        this.contextMemory = [];
        this.initializeElements();
        this.attachEventListeners();
    }

    initializeElements() {
        this.container = document.getElementById('chatbotContainer');
        this.toggle = document.getElementById('chatbotToggle');
        this.close = document.getElementById('chatbotClose');
        this.messages = document.getElementById('chatbotMessages');
        this.input = document.getElementById('chatbotInput');
        this.sendBtn = document.getElementById('chatbotSend');
        this.suggestions = document.getElementById('chatbotSuggestions');
        this.badge = document.getElementById('chatbotBadge');
    }

    attachEventListeners() {
        this.toggle.addEventListener('click', () => this.toggleChat());
        this.close.addEventListener('click', () => this.closeChat());
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        this.suggestions.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-btn')) {
                this.input.value = e.target.dataset.question;
                this.sendMessage();
            }
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.container.classList.add('active');
            this.input.focus();
            this.hideBadge();
        } else {
            this.container.classList.remove('active');
        }
    }

    closeChat() {
        this.isOpen = false;
        this.container.classList.remove('active');
    }

    showBadge() {
        this.messageCount++;
        this.badge.textContent = this.messageCount;
        this.badge.classList.remove('hidden');
    }

    hideBadge() {
        this.messageCount = 0;
        this.badge.classList.add('hidden');
    }

    sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;

        this.addMessage(message, 'user');
        this.input.value = '';
        this.showTypingIndicator();
        
        setTimeout(() => {
            this.hideTypingIndicator();
            const response = this.generateResponse(message);
            this.addMessage(response, 'bot');
        }, 1000 + Math.random() * 1000);
    }

    addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chatbot-message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'bot' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = this.formatMessage(content);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        // Agregar botones de feedback para mensajes del bot
        if (sender === 'bot') {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.className = 'message-feedback';
            feedbackDiv.innerHTML = `
                <button class="feedback-btn helpful" data-feedback="helpful" title="Útil">
                    <i class="fas fa-thumbs-up"></i>
                </button>
                <button class="feedback-btn not-helpful" data-feedback="not-helpful" title="No útil">
                    <i class="fas fa-thumbs-down"></i>
                </button>
            `;
            
            // Agregar event listeners para feedback
            feedbackDiv.addEventListener('click', (e) => {
                if (e.target.closest('.feedback-btn')) {
                    const feedback = e.target.closest('.feedback-btn').dataset.feedback;
                    this.handleFeedback(feedback, content);
                    e.target.closest('.feedback-btn').classList.add('active');
                }
            });
            
            messageDiv.appendChild(feedbackDiv);
        }
        
        this.messages.appendChild(messageDiv);
        
        this.scrollToBottom();
        this.conversationHistory.push({ sender, content });
    }
    
    handleFeedback(feedback, response) {
        const lastUserMessage = this.conversationHistory
            .filter(msg => msg.sender === 'user')
            .slice(-1)[0];
        
        if (lastUserMessage) {
            const wasHelpful = feedback === 'helpful';
            this.learnFromInteraction(lastUserMessage.content, response, wasHelpful);
            
            console.log('🤖 Feedback received:', {
                feedback,
                wasHelpful,
                userMessage: lastUserMessage.content
            });
        }
    }

    formatMessage(content) {
        if (typeof content === 'string') {
            return `<p>${content}</p>`;
        }
        
        let html = '';
        if (content.text) html += `<p>${content.text}</p>`;
        if (content.list) {
            html += '<ul>';
            content.list.forEach(item => html += `<li>${item}</li>`);
            html += '</ul>';
        }
        if (content.tips) {
            html += '<div class="chatbot-tips">';
            content.tips.forEach(tip => html += `<div class="tip-item">${tip}</div>`);
            html += '</div>';
        }
        
        return html;
    }

    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chatbot-message bot-message typing-indicator';
        typingDiv.id = 'typingIndicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
        
        const typingContent = document.createElement('div');
        typingContent.className = 'typing-indicator';
        typingContent.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(typingContent);
        this.messages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    scrollToBottom() {
        this.messages.scrollTop = this.messages.scrollHeight;
    }

    generateResponse(userMessage) {
        const message = userMessage.toLowerCase();
        const context = this.getCurrentContext();
        const currentData = this.getCurrentAppData();
        
        // Análisis de intención avanzado
        const intent = this.analyzeIntent(message);
        const sentiment = this.analyzeSentiment(message);
        
        console.log('🤖 Chatbot AI Analysis:', {
            message: userMessage,
            intent: intent,
            sentiment: sentiment,
            context: context,
            currentData: currentData
        });
        
        // Respuestas contextuales basadas en datos actuales
        if (intent === 'current_conditions' || message.includes('actual') || message.includes('ahora')) {
            return this.getCurrentConditionsResponse(currentData);
        }
        
        if (intent === 'forecast' || message.includes('pronóstico') || message.includes('futuro')) {
            return this.getForecastResponse(currentData);
        }
        
        if (intent === 'health_advice' || message.includes('salud') || message.includes('recomendación')) {
            return this.getHealthAdviceResponse(currentData, sentiment);
        }
        
        if (intent === 'pollutant_info' || message.includes('contaminante') || message.includes('partícula')) {
            return this.getPollutantInfoResponse(message, currentData);
        }
        
        if (intent === 'location_specific' || message.includes('ubicación') || message.includes('ciudad')) {
            return this.getLocationSpecificResponse(currentData);
        }
        
        if (intent === 'comparison' || message.includes('comparar') || message.includes('diferencia')) {
            return this.getComparisonResponse(message, currentData);
        }
        
        if (intent === 'emergency' || message.includes('emergencia') || message.includes('peligro')) {
            return this.getEmergencyResponse(currentData);
        }
        
        // Verificar si hay contexto relevante de conversaciones anteriores
        const contextualResponse = this.getContextualResponse(userMessage);
        if (contextualResponse) {
            this.updateContextMemory(userMessage, contextualResponse);
            this.learnFromInteraction(userMessage, contextualResponse);
            return contextualResponse;
        }
        
        // Respuestas personalizadas basadas en aprendizaje
        const personalizedResponse = this.getPersonalizedResponse(intent, currentData);
        if (personalizedResponse) {
            this.updateContextMemory(userMessage, personalizedResponse);
            this.learnFromInteraction(userMessage, personalizedResponse);
            return personalizedResponse;
        }
        
        // Respuestas específicas mejoradas
        if (message.includes('aqi') || message.includes('índice') || message.includes('calidad del aire')) {
            const response = this.getAQIResponse(currentData);
            this.updateContextMemory(userMessage, response);
            this.learnFromInteraction(userMessage, response);
            return response;
        }
        
        if (message.includes('contaminante') || message.includes('partícula') || message.includes('pm2.5') || message.includes('pm10')) {
            return {
                text: "Los principales contaminantes que monitoreamos son:",
                list: [
                    "🌫️ PM2.5 - Partículas finas (diámetro < 2.5 μm)",
                    "🌫️ PM10 - Partículas gruesas (diámetro < 10 μm)",
                    "🌫️ O₃ - Ozono troposférico",
                    "🌫️ NO₂ - Dióxido de nitrógeno",
                    "🌫️ SO₂ - Dióxido de azufre",
                    "🌫️ CO - Monóxido de carbono"
                ]
            };
        }
        
        if (message.includes('salud') || message.includes('efecto') || message.includes('riesgo')) {
            return {
                text: "La calidad del aire afecta tu salud de diferentes maneras:",
                list: [
                    "👶 Niños y ancianos son más vulnerables",
                    "🫁 Puede causar problemas respiratorios",
                    "❤️ Afecta el sistema cardiovascular",
                    "🧠 Puede impactar la función cognitiva",
                    "🤧 Empeora alergias y asma",
                    "⚠️ Exposición prolongada aumenta riesgos"
                ],
                tips: [
                    "💡 Usa mascarilla en días de alta contaminación",
                    "🏠 Mantén ventanas cerradas cuando el AQI es alto",
                    "🚶 Evita ejercicio al aire libre en días insalubres",
                    "🌿 Considera purificadores de aire en interiores"
                ]
            };
        }
        
        if (message.includes('meteorológico') || message.includes('clima') || message.includes('temperatura') || message.includes('viento')) {
            return {
                text: "Los datos meteorológicos nos ayudan a entender la calidad del aire:",
                list: [
                    "🌡️ Temperatura - Afecta la formación de ozono",
                    "💨 Viento - Dispersa o concentra contaminantes",
                    "💧 Humedad - Influye en la formación de partículas",
                    "☁️ Presión atmosférica - Afecta la circulación del aire",
                    "🌧️ Lluvia - Limpia la atmósfera naturalmente"
                ]
            };
        }
        
        if (message.includes('usar') || message.includes('aplicación') || message.includes('funciones') || message.includes('navegación')) {
            return {
                text: "AirBytes tiene varias secciones para explorar:",
                list: [
                    "📊 Hoy - Datos actuales de calidad del aire",
                    "⏰ Cada Hora - Pronóstico horario",
                    "📅 Diario - Pronóstico de 7 días",
                    "📈 Mensual - Análisis de tendencias",
                    "🌬️ Calidad del Aire - Detalles de contaminantes"
                ],
                tips: [
                    "📍 Usa el botón de ubicación para datos de tu zona",
                    "🌍 Cambia el país en el selector superior",
                    "📱 La app es completamente responsive",
                    "🔔 Recibe notificaciones de alertas importantes"
                ]
            };
        }
        
        if (message.includes('recomendación') || message.includes('consejo') || message.includes('qué hacer')) {
            return {
                text: "Basándome en los datos actuales, te recomiendo:",
                tips: [
                    "✅ Revisa el AQI actual en la sección 'Hoy'",
                    "📊 Consulta el pronóstico en 'Cada Hora' o 'Diario'",
                    "🌱 Si el AQI es alto, evita actividades al aire libre",
                    "🏠 Mantén ventanas cerradas en días contaminados",
                    "🚗 Reduce el uso del vehículo si es posible",
                    "🌿 Considera usar transporte público o caminar"
                ]
            };
        }
        
        if (message.includes('gracias') || message.includes('thanks') || message.includes('perfecto')) {
            return "¡De nada! 😊 Estoy aquí para ayudarte con cualquier pregunta sobre la calidad del aire y la aplicación AirBytes. ¿Hay algo más en lo que pueda asistirte?";
        }
        
        if (message.includes('hola') || message.includes('hi') || message.includes('buenos días') || message.includes('buenas tardes')) {
            return "¡Hola! 👋 Bienvenido a AirBytes. Soy tu asistente virtual y puedo ayudarte con información sobre calidad del aire, datos meteorológicos, recomendaciones de salud y cómo usar la aplicación. ¿En qué puedo ayudarte?";
        }
        
        return {
            text: "Interesante pregunta. Aunque no tengo información específica sobre eso, puedo ayudarte con:",
            list: [
                "📊 Información sobre calidad del aire y AQI",
                "🌤️ Datos meteorológicos y su impacto",
                "🌱 Recomendaciones de salud",
                "📈 Cómo interpretar los gráficos y datos",
                "❓ Cómo usar las diferentes secciones de la app"
            ],
            tips: [
                "💡 Prueba preguntando sobre 'AQI' o 'contaminantes'",
                "🔍 Explora las secciones de la app para más detalles",
                "📱 Los datos se actualizan en tiempo real"
            ]
        };
    }

    // ===== FUNCIONES DE IA AVANZADA =====
    
    analyzeIntent(message) {
        const intents = {
            'current_conditions': ['actual', 'ahora', 'hoy', 'condiciones', 'estado'],
            'forecast': ['pronóstico', 'futuro', 'mañana', 'semana', 'predicción'],
            'health_advice': ['salud', 'recomendación', 'consejo', 'qué hacer', 'precaución'],
            'pollutant_info': ['contaminante', 'partícula', 'pm2.5', 'pm10', 'ozono', 'no2', 'so2', 'co'],
            'location_specific': ['ubicación', 'ciudad', 'zona', 'área', 'región'],
            'comparison': ['comparar', 'diferencia', 'mejor', 'peor', 'vs', 'versus'],
            'emergency': ['emergencia', 'peligro', 'alerta', 'crítico', 'urgente'],
            'help': ['ayuda', 'cómo', 'funciona', 'usar', 'navegar'],
            'technical': ['técnico', 'datos', 'api', 'fuente', 'precisión']
        };
        
        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                return intent;
            }
        }
        return 'general';
    }
    
    analyzeSentiment(message) {
        const positiveWords = ['bueno', 'excelente', 'genial', 'perfecto', 'mejor', 'bien'];
        const negativeWords = ['malo', 'terrible', 'horrible', 'peligroso', 'preocupante', 'mal'];
        const urgentWords = ['urgente', 'emergencia', 'crítico', 'peligro', 'alerta'];
        
        const positiveCount = positiveWords.filter(word => message.includes(word)).length;
        const negativeCount = negativeWords.filter(word => message.includes(word)).length;
        const urgentCount = urgentWords.filter(word => message.includes(word)).length;
        
        if (urgentCount > 0) return 'urgent';
        if (negativeCount > positiveCount) return 'negative';
        if (positiveCount > negativeCount) return 'positive';
        return 'neutral';
    }
    
    getCurrentContext() {
        // Obtener contexto de la aplicación actual
        const activeSection = document.querySelector('.section.active')?.id || 'today-section';
        const currentLocation = document.getElementById('locationSelect')?.value || 'colombia';
        const currentTime = new Date();
        
        return {
            activeSection,
            currentLocation,
            currentTime,
            isDaytime: currentTime.getHours() >= 6 && currentTime.getHours() < 18
        };
    }
    
    getCurrentAppData() {
        // Obtener datos actuales de la aplicación
        try {
            const weatherTemp = document.getElementById('weatherTemp')?.textContent;
            const aqiValue = document.getElementById('aqiValue')?.textContent;
            const weatherDesc = document.getElementById('weatherDesc')?.textContent;
            const locationName = document.getElementById('locationName')?.textContent;
            
            return {
                temperature: weatherTemp ? parseInt(weatherTemp) : null,
                aqi: aqiValue ? parseInt(aqiValue) : null,
                weatherDescription: weatherDesc || null,
                location: locationName || null,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn('Error getting current app data:', error);
            return null;
        }
    }
    
    // ===== RESPUESTAS CONTEXTUALES AVANZADAS =====
    
    getCurrentConditionsResponse(data) {
        if (!data || !data.aqi) {
            return {
                text: "No tengo datos actuales disponibles. Por favor, asegúrate de que la aplicación esté cargada correctamente.",
                tips: [
                    "🔄 Recarga la página si es necesario",
                    "📍 Verifica que la ubicación esté seleccionada",
                    "🌐 Comprueba tu conexión a internet"
                ]
            };
        }
        
        const aqiLevel = this.getAQILevel(data.aqi);
        const recommendations = this.getAQIRecommendations(data.aqi);
        
        return {
            text: `🌤️ **Condiciones Actuales en ${data.location || 'tu ubicación'}:**`,
            list: [
                `🌡️ Temperatura: ${data.temperature || 'N/A'}°C`,
                `🌬️ AQI: ${data.aqi} (${aqiLevel})`,
                `☁️ Clima: ${data.weatherDescription || 'N/A'}`,
                `⏰ Última actualización: ${new Date().toLocaleTimeString()}`
            ],
            tips: recommendations
        };
    }
    
    getForecastResponse(data) {
        return {
            text: "📅 **Pronóstico de Calidad del Aire:**",
            list: [
                "📊 Consulta la sección 'Cada Hora' para pronóstico detallado",
                "📈 Revisa 'Diario' para tendencias de 7 días",
                "🌡️ Los datos meteorológicos ayudan a predecir la calidad del aire"
            ],
            tips: [
                "💡 Los vientos fuertes mejoran la calidad del aire",
                "🌧️ La lluvia limpia naturalmente la atmósfera",
                "☀️ Los días soleados pueden aumentar el ozono",
                "🌫️ Las condiciones estables concentran contaminantes"
            ]
        };
    }
    
    getHealthAdviceResponse(data, sentiment) {
        if (!data || !data.aqi) {
            return {
                text: "Para darte recomendaciones de salud precisas, necesito datos actuales de calidad del aire.",
                tips: [
                    "🔄 Asegúrate de que la aplicación esté cargada",
                    "📍 Selecciona tu ubicación",
                    "⏰ Espera a que se actualicen los datos"
                ]
            };
        }
        
        const aqiLevel = this.getAQILevel(data.aqi);
        const healthRisks = this.getHealthRisks(data.aqi);
        const recommendations = this.getHealthRecommendations(data.aqi, sentiment);
        
        return {
            text: `🏥 **Recomendaciones de Salud (AQI: ${data.aqi} - ${aqiLevel}):**`,
            list: healthRisks,
            tips: recommendations
        };
    }
    
    getPollutantInfoResponse(message, data) {
        const pollutants = {
            'pm2.5': {
                name: 'PM2.5 (Partículas Finas)',
                description: 'Partículas menores a 2.5 micrómetros',
                health: 'Pueden penetrar profundamente en los pulmones',
                sources: 'Tráfico, industria, quema de combustibles'
            },
            'pm10': {
                name: 'PM10 (Partículas Gruesas)',
                description: 'Partículas menores a 10 micrómetros',
                health: 'Afectan el sistema respiratorio',
                sources: 'Polvo, polen, construcción'
            },
            'o3': {
                name: 'Ozono (O₃)',
                description: 'Gas formado por reacciones químicas',
                health: 'Irrita ojos, nariz y garganta',
                sources: 'Emisiones vehiculares + luz solar'
            },
            'no2': {
                name: 'Dióxido de Nitrógeno (NO₂)',
                description: 'Gas marrón-rojizo',
                health: 'Afecta el sistema respiratorio',
                sources: 'Tráfico, centrales eléctricas'
            },
            'so2': {
                name: 'Dióxido de Azufre (SO₂)',
                description: 'Gas incoloro con olor penetrante',
                health: 'Irrita vías respiratorias',
                sources: 'Combustión de carbón, petróleo'
            },
            'co': {
                name: 'Monóxido de Carbono (CO)',
                description: 'Gas incoloro e inodoro',
                health: 'Reduce capacidad de transporte de oxígeno',
                sources: 'Combustión incompleta de combustibles'
            }
        };
        
        const detectedPollutant = Object.keys(pollutants).find(p => message.includes(p));
        
        if (detectedPollutant) {
            const pollutant = pollutants[detectedPollutant];
            return {
                text: `🌫️ **${pollutant.name}:**`,
                list: [
                    `📝 Descripción: ${pollutant.description}`,
                    `🏥 Efectos en salud: ${pollutant.health}`,
                    `🏭 Principales fuentes: ${pollutant.sources}`
                ],
                tips: [
                    "💡 Usa mascarilla N95 en días de alta contaminación",
                    "🏠 Mantén ventanas cerradas cuando los niveles son altos",
                    "🚶 Evita ejercicio al aire libre en días insalubres"
                ]
            };
        }
        
        return {
            text: "🌫️ **Principales Contaminantes Monitoreados:**",
            list: Object.values(pollutants).map(p => `• ${p.name}: ${p.description}`),
            tips: [
                "🔍 Pregunta por un contaminante específico (ej: 'PM2.5')",
                "📊 Revisa los valores actuales en la sección 'Hoy'",
                "⚠️ Los niveles altos requieren precauciones especiales"
            ]
        };
    }
    
    getLocationSpecificResponse(data) {
        const location = data?.location || 'tu ubicación';
        return {
            text: `📍 **Datos Específicos para ${location}:**`,
            list: [
                "🌍 Los datos se obtienen de estaciones meteorológicas locales",
                "🔄 Se actualizan cada 10 minutos con información en tiempo real",
                "📊 Incluyen calidad del aire, clima y pronósticos"
            ],
            tips: [
                "🌐 Cambia la ubicación usando el selector superior",
                "📍 Usa el botón de geolocalización para tu posición exacta",
                "🏙️ Los datos urbanos pueden diferir de áreas rurales"
            ]
        };
    }
    
    getComparisonResponse(message, data) {
        return {
            text: "📊 **Comparación de Datos:**",
            list: [
                "📈 Usa la sección 'Mensual' para comparar tendencias",
                "⏰ Compara 'Hoy' vs 'Cada Hora' para ver variaciones",
                "🌍 Cambia ubicaciones para comparar diferentes ciudades"
            ],
            tips: [
                "💡 Los datos se normalizan según estándares internacionales",
                "📊 El AQI permite comparar entre diferentes contaminantes",
                "🔄 Los datos históricos ayudan a identificar patrones"
            ]
        };
    }
    
    getEmergencyResponse(data) {
        if (!data || !data.aqi) {
            return {
                text: "🚨 **En caso de emergencia por calidad del aire:**",
                list: [
                    "🏠 Permanece en interiores con ventanas cerradas",
                    "🚫 Evita actividades al aire libre",
                    "📞 Contacta servicios de emergencia si es necesario"
                ],
                tips: [
                    "⚠️ AQI > 200 requiere precauciones inmediatas",
                    "👶 Niños y ancianos son más vulnerables",
                    "🫁 Personas con asma deben usar medicamentos preventivos"
                ]
            };
        }
        
        const aqiLevel = this.getAQILevel(data.aqi);
        const isEmergency = data.aqi > 200;
        
        if (isEmergency) {
            return {
                text: `🚨 **ALERTA DE CALIDAD DEL AIRE - AQI: ${data.aqi} (${aqiLevel})**`,
                list: [
                    "🏠 PERMANECE EN INTERIORES",
                    "🚫 EVITA actividades al aire libre",
                    "🪟 MANTÉN ventanas y puertas cerradas",
                    "👶 PROTEGE especialmente a niños y ancianos"
                ],
                tips: [
                    "📞 Contacta servicios de emergencia si tienes problemas respiratorios",
                    "💊 Usa medicamentos preventivos si tienes asma",
                    "🌬️ Considera usar purificadores de aire"
                ]
            };
        }
        
        return {
            text: `✅ **Calidad del Aire Actual: ${aqiLevel}**`,
            list: [
                "🌤️ Las condiciones son manejables",
                "🚶 Puedes realizar actividades normales",
                "👀 Monitorea cambios en los próximos días"
            ],
            tips: [
                "📊 Revisa el pronóstico para planificar actividades",
                "🌱 Los grupos sensibles deben tomar precauciones",
                "🔄 Los datos se actualizan automáticamente"
            ]
        };
    }
    
    getAQIResponse(data) {
        if (!data || !data.aqi) {
            return {
                text: "📊 **Índice de Calidad del Aire (AQI):**",
                list: [
                    "🟢 0-50: Buena - Aire satisfactorio",
                    "🟡 51-100: Moderada - Aceptable para la mayoría",
                    "🟠 101-150: Insalubre para grupos sensibles",
                    "🔴 151-200: Insalubre - Todos pueden experimentar efectos",
                    "🟣 201-300: Muy insalubre - Alerta de salud",
                    "🟤 301-500: Peligroso - Alerta de emergencia"
                ]
            };
        }
        
        const aqiLevel = this.getAQILevel(data.aqi);
        const recommendations = this.getAQIRecommendations(data.aqi);
        
        return {
            text: `📊 **AQI Actual: ${data.aqi} (${aqiLevel})**`,
            list: [
                `📍 Ubicación: ${data.location || 'No disponible'}`,
                `⏰ Última actualización: ${new Date().toLocaleTimeString()}`,
                `🌡️ Temperatura: ${data.temperature || 'N/A'}°C`
            ],
            tips: recommendations
        };
    }
    
    // ===== FUNCIONES AUXILIARES =====
    
    getAQILevel(aqi) {
        if (aqi <= 50) return 'Buena';
        if (aqi <= 100) return 'Moderada';
        if (aqi <= 150) return 'Insalubre para grupos sensibles';
        if (aqi <= 200) return 'Insalubre';
        if (aqi <= 300) return 'Muy insalubre';
        return 'Peligroso';
    }
    
    getAQIRecommendations(aqi) {
        if (aqi <= 50) {
            return [
                "✅ Excelente calidad del aire",
                "🚶 Perfecto para actividades al aire libre",
                "🌱 Ideal para ejercicio y deportes"
            ];
        } else if (aqi <= 100) {
            return [
                "✅ Buena calidad del aire",
                "🚶 Actividades normales son seguras",
                "👀 Grupos sensibles deben monitorear síntomas"
            ];
        } else if (aqi <= 150) {
            return [
                "⚠️ Grupos sensibles deben reducir actividades al aire libre",
                "👶 Niños y ancianos deben tomar precauciones",
                "🫁 Personas con asma deben usar medicamentos"
            ];
        } else if (aqi <= 200) {
            return [
                "🚫 Todos deben evitar actividades al aire libre",
                "🏠 Permanece en interiores con ventanas cerradas",
                "🚗 Evita conducir si no es necesario"
            ];
        } else {
            return [
                "🚨 ALERTA - Evita salir al exterior",
                "🏠 Permanece en interiores con purificadores",
                "📞 Contacta servicios médicos si tienes síntomas"
            ];
        }
    }
    
    getHealthRisks(aqi) {
        if (aqi <= 50) {
            return ["✅ Riesgo mínimo para la salud"];
        } else if (aqi <= 100) {
            return ["⚠️ Riesgo bajo para grupos sensibles"];
        } else if (aqi <= 150) {
            return [
                "🫁 Problemas respiratorios en grupos sensibles",
                "👶 Niños y ancianos en riesgo",
                "🤧 Puede empeorar alergias y asma"
            ];
        } else if (aqi <= 200) {
            return [
                "🫁 Todos pueden experimentar problemas respiratorios",
                "❤️ Riesgo cardiovascular aumentado",
                "🧠 Posible impacto en función cognitiva"
            ];
        } else {
            return [
                "🚨 RIESGO CRÍTICO para toda la población",
                "🫁 Problemas respiratorios severos",
                "❤️ Emergencias cardiovasculares posibles"
            ];
        }
    }
    
    getHealthRecommendations(aqi, sentiment) {
        const baseRecommendations = this.getAQIRecommendations(aqi);
        
        if (sentiment === 'urgent') {
            return [
                "🚨 ATENCIÓN INMEDIATA REQUERIDA",
                ...baseRecommendations,
                "📞 Contacta servicios de emergencia si es necesario"
            ];
        } else if (sentiment === 'negative') {
            return [
                "😟 Entiendo tu preocupación",
                ...baseRecommendations,
                "💡 Los datos se actualizan constantemente"
            ];
        }
        
        return baseRecommendations;
    }
    
    // ===== FUNCIONES DE APRENDIZAJE Y MEMORIA =====
    
    loadUserPreferences() {
        try {
            const saved = localStorage.getItem('chatbot_user_preferences');
            return saved ? JSON.parse(saved) : {
                language: 'es',
                preferredTopics: [],
                alertLevel: 'moderate',
                experience: 'beginner'
            };
        } catch (error) {
            console.warn('Error loading user preferences:', error);
            return {
                language: 'es',
                preferredTopics: [],
                alertLevel: 'moderate',
                experience: 'beginner'
            };
        }
    }
    
    saveUserPreferences() {
        try {
            localStorage.setItem('chatbot_user_preferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.warn('Error saving user preferences:', error);
        }
    }
    
    loadLearningData() {
        try {
            const saved = localStorage.getItem('chatbot_learning_data');
            return saved ? JSON.parse(saved) : {
                commonQuestions: {},
                userInterests: {},
                responsePatterns: {},
                successRate: 0
            };
        } catch (error) {
            console.warn('Error loading learning data:', error);
            return {
                commonQuestions: {},
                userInterests: {},
                responsePatterns: {},
                successRate: 0
            };
        }
    }
    
    saveLearningData() {
        try {
            localStorage.setItem('chatbot_learning_data', JSON.stringify(this.learningData));
        } catch (error) {
            console.warn('Error saving learning data:', error);
        }
    }
    
    learnFromInteraction(userMessage, response, wasHelpful = null) {
        // Aprender de las interacciones del usuario
        const message = userMessage.toLowerCase();
        
        // Actualizar preguntas comunes
        if (!this.learningData.commonQuestions[message]) {
            this.learningData.commonQuestions[message] = 0;
        }
        this.learningData.commonQuestions[message]++;
        
        // Detectar intereses del usuario
        const topics = this.extractTopics(message);
        topics.forEach(topic => {
            if (!this.learningData.userInterests[topic]) {
                this.learningData.userInterests[topic] = 0;
            }
            this.learningData.userInterests[topic]++;
        });
        
        // Guardar patrón de respuesta si fue útil
        if (wasHelpful === true) {
            const intent = this.analyzeIntent(message);
            if (!this.learningData.responsePatterns[intent]) {
                this.learningData.responsePatterns[intent] = [];
            }
            this.learningData.responsePatterns[intent].push({
                message: userMessage,
                response: response,
                timestamp: new Date().toISOString()
            });
        }
        
        this.saveLearningData();
    }
    
    extractTopics(message) {
        const topics = [];
        const topicKeywords = {
            'aqi': ['aqi', 'índice', 'calidad del aire'],
            'health': ['salud', 'recomendación', 'consejo', 'precaución'],
            'weather': ['clima', 'temperatura', 'viento', 'lluvia'],
            'pollutants': ['contaminante', 'partícula', 'pm2.5', 'pm10', 'ozono'],
            'forecast': ['pronóstico', 'futuro', 'mañana', 'predicción'],
            'emergency': ['emergencia', 'alerta', 'peligro', 'crítico']
        };
        
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                topics.push(topic);
            }
        }
        
        return topics;
    }
    
    getPersonalizedResponse(intent, data) {
        // Respuestas personalizadas basadas en el historial del usuario
        const userInterests = Object.keys(this.learningData.userInterests)
            .sort((a, b) => this.learningData.userInterests[b] - this.learningData.userInterests[a])
            .slice(0, 3);
        
        const experience = this.userPreferences.experience;
        
        // Adaptar el nivel de detalle según la experiencia
        let response = this.getBaseResponse(intent, data);
        
        if (experience === 'beginner') {
            response = this.simplifyResponse(response);
        } else if (experience === 'expert') {
            response = this.addTechnicalDetails(response);
        }
        
        // Agregar información relacionada con intereses del usuario
        if (userInterests.length > 0) {
            response = this.addRelatedInfo(response, userInterests);
        }
        
        return response;
    }
    
    simplifyResponse(response) {
        // Simplificar respuesta para usuarios principiantes
        if (response.list && response.list.length > 3) {
            response.list = response.list.slice(0, 3);
        }
        if (response.tips && response.tips.length > 2) {
            response.tips = response.tips.slice(0, 2);
        }
        return response;
    }
    
    addTechnicalDetails(response) {
        // Agregar detalles técnicos para usuarios expertos
        if (response.text && !response.text.includes('**')) {
            response.text = `**Detalles Técnicos:** ${response.text}`;
        }
        return response;
    }
    
    addRelatedInfo(response, interests) {
        // Agregar información relacionada con los intereses del usuario
        const relatedTips = [];
        
        if (interests.includes('health')) {
            relatedTips.push("🏥 Revisa la sección 'Salud' para más detalles médicos");
        }
        if (interests.includes('forecast')) {
            relatedTips.push("📅 Consulta 'Cada Hora' y 'Diario' para pronósticos detallados");
        }
        if (interests.includes('pollutants')) {
            relatedTips.push("🌫️ Explora los contaminantes específicos en 'Calidad del Aire'");
        }
        
        if (relatedTips.length > 0 && response.tips) {
            response.tips = [...response.tips, ...relatedTips];
        }
        
        return response;
    }
    
    getBaseResponse(intent, data) {
        // Obtener respuesta base según la intención
        switch (intent) {
            case 'current_conditions':
                return this.getCurrentConditionsResponse(data);
            case 'forecast':
                return this.getForecastResponse(data);
            case 'health_advice':
                return this.getHealthAdviceResponse(data, 'neutral');
            case 'pollutant_info':
                return this.getPollutantInfoResponse('', data);
            case 'location_specific':
                return this.getLocationSpecificResponse(data);
            case 'comparison':
                return this.getComparisonResponse('', data);
            case 'emergency':
                return this.getEmergencyResponse(data);
            default:
                return this.getGeneralResponse();
        }
    }
    
    getGeneralResponse() {
        return {
            text: "🤖 **Soy tu asistente inteligente de AirBytes**",
            list: [
                "📊 Puedo ayudarte con datos de calidad del aire",
                "🏥 Te doy recomendaciones de salud personalizadas",
                "🌤️ Analizo condiciones meteorológicas",
                "🔮 Te ayudo con pronósticos y tendencias"
            ],
            tips: [
                "💡 Pregúntame sobre condiciones actuales",
                "🔍 Pregunta por contaminantes específicos (PM2.5, O3, etc.)",
                "📱 Explora las diferentes secciones de la app"
            ]
        };
    }
    
    // ===== FUNCIONES DE CONTEXTO AVANZADO =====
    
    updateContextMemory(userMessage, response) {
        // Mantener memoria de contexto de la conversación
        this.contextMemory.push({
            userMessage,
            response,
            timestamp: new Date().toISOString(),
            context: this.getCurrentContext()
        });
        
        // Mantener solo los últimos 10 intercambios
        if (this.contextMemory.length > 10) {
            this.contextMemory = this.contextMemory.slice(-10);
        }
    }
    
    getContextualResponse(userMessage) {
        // Respuesta basada en el contexto de la conversación
        const recentContext = this.contextMemory.slice(-3);
        const currentData = this.getCurrentAppData();
        
        // Si el usuario pregunta sobre algo mencionado recientemente
        for (const context of recentContext) {
            if (this.isRelatedQuestion(userMessage, context.userMessage)) {
                return this.getFollowUpResponse(userMessage, context, currentData);
            }
        }
        
        return null; // No hay contexto relevante
    }
    
    isRelatedQuestion(currentMessage, previousMessage) {
        const currentWords = currentMessage.toLowerCase().split(' ');
        const previousWords = previousMessage.toLowerCase().split(' ');
        
        // Buscar palabras clave en común
        const commonWords = currentWords.filter(word => 
            previousWords.includes(word) && word.length > 3
        );
        
        return commonWords.length >= 2;
    }
    
    getFollowUpResponse(userMessage, context, currentData) {
        return {
            text: `🔄 **Siguiendo tu pregunta anterior sobre "${context.userMessage}":**`,
            list: [
                "📊 Aquí tienes información adicional relacionada",
                "🔍 ¿Te gustaría profundizar en algún aspecto específico?",
                "💡 Puedo ayudarte con más detalles si necesitas"
            ],
            tips: [
                "🤖 Recuerdo nuestro contexto de conversación",
                "📱 Los datos se actualizan en tiempo real",
                "❓ Pregunta por cualquier duda adicional"
            ]
        };
    }

    initializeKnowledgeBase() {
        return {
            aqi: {
                good: "0-50: Buena calidad del aire",
                moderate: "51-100: Calidad moderada",
                unhealthySensitive: "101-150: Insalubre para grupos sensibles",
                unhealthy: "151-200: Insalubre para todos",
                veryUnhealthy: "201-300: Muy insalubre",
                hazardous: "301-500: Peligroso"
            },
            pollutants: {
                pm25: "Partículas finas PM2.5",
                pm10: "Partículas gruesas PM10",
                o3: "Ozono troposférico",
                no2: "Dióxido de nitrógeno",
                so2: "Dióxido de azufre",
                co: "Monóxido de carbono"
            },
            health: {
                sensitive: "Grupos sensibles: niños, ancianos, personas con asma",
                respiratory: "Problemas respiratorios y cardiovasculares",
                longTerm: "Exposición prolongada aumenta riesgos de enfermedades"
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new AirBytesApp();
    window.airBytesApp = app;
    
    const chatbot = new Chatbot();
});


 














