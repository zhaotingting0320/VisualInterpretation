////////////////////////////////////////////////////////////////////
// 
// Utility functions for getting inputs for CCDC
//  
/////////////////////////////////////////////////////////////////*/
 
var dateUtils = require('users/Eliza_Ting/code:CCDC/dates.js')
var ccdcUtils = require('users/Eliza_Ting/code:CCDC/ccdc.js')
 //users/Eliza_Ting/code:CCDC
/**
* Get Landsat images for a specific region
* Possible bands and indices: BLUE, GREEN, RED, NIR, SWIR1, SWIR2, NDVI, NBR, EVI, EVI2,BRIGHTNESS, GREENNESS, WETNESS
* @param {ee.Dict} options Parameter file containing the keys below
* @param {String} start First date to filter images
* @param {String} end Last date to filter images
* @param {list} targetBands Bands and indices to return
* 
* @returns                ee.ImageCol.    Masked image collection with L4, L5, L7, and L8
*/
function getLandsat(options) {
  var collection = (options && options.collection) || 2
  var start = (options && options.start) || '1980-01-01'
  var end = (options && options.end) || '2023-01-01'
  var startDoy = (options && options.startDOY) || 1
  var endDoy = (options && options.endDOY) || 366
  var region = (options && options.region) || null
  var targetBands = (options && options.targetBands) || ['BLUE','GREEN','RED',
      'NIR','SWIR1','SWIR2','TEMP', 'NBR','NDFI','NDVI','GV','NPV','Shade','Soil',
      'EVI', 'EVI2', 'BRIGHTNESS', 'GREENNESS', 'WETNESS']
  var useMask = (options && options.useMask) || true
  var sensors = (options && options.sensors) || {l4: true, l5: true, l7: true, l8: true}
 
  if (useMask == 'No') {
    useMask = false
  } 
 
  // Define collection to use and select band names and functions accordingly
  if (collection == 1){
    print("Landsat collection 1 has been deprecated")
  } else if (collection == 2){
    var collection8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterDate(start, end);
    var collection7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
        .filterDate(start, end);
    var collection5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
        .filterDate(start, end);
    var collection4 = ee.ImageCollection('LANDSAT/LT04/C02/T1_L2')
        .filterDate(start, end);

    if (useMask) {
      collection8 = collection8.map(prepareL8Col2)
      collection7 = collection7.map(prepareL4L5L7Col2)
      collection5 = collection5.map(prepareL4L5L7Col2)
      collection4 = collection4.map(prepareL4L5L7Col2)
      
    } else {
      var bandListL8 = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'SR_B10']
      var nameListL8 = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
      var bandListL457 = ['SR_B1', 'SR_B2','SR_B3','SR_B4','SR_B5','SR_B7','ST_B6']
      var nameListL457 = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
      collection8 = collection8.map(function(i) {
          return i.select(bandListL8).rename(nameListL8)})
      collection7 = collection7.map(function(i) {
          return i.select(bandListL457).rename(nameListL457)})
      collection4 = collection4.map(function(i) {
          return i.select(bandListL457).rename(nameListL457)})
      collection5 = collection5.map(function(i) {
          return i.select(bandListL457).rename(nameListL457)})
    }
  }
  
  // Merge all collections, compute indices and filter if requested
  var col = collection4.merge(collection5)
                        .merge(collection7)
                        .merge(collection8)
  if (region) {
    col = col.filterBounds(region)
  }
  
  var indices = doIndices(col).select(targetBands)
  
  if (!sensors.l5) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_5')
  } 
  if (!sensors.l4) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_4')
  }
  if (!sensors.l7) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_7')
  }
  if (!sensors.l8) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_8')
  }
  var indices = indices.filter(ee.Filter.dayOfYear(startDoy, endDoy))
  
  return ee.ImageCollection(indices)
}  

/**
* Calculate spectral indices for all bands in collection
* @param {ee.ImageCollection} collection Landsat image collection
* @returns {ee.ImageCollection} Landsat image with spectral indices
*/
function doIndices(collection) {
  return collection.map(function(image) {
    var NDVI = calcNDVI(image)
    var NDSI = calcNDSI(image)
    var NBR = calcNBR(image)
    var EVI = calcEVI(image)
    var EVI2 = calcEVI2(image)
    var TC = tcTrans(image)
    // NDFI function requires surface reflectance bands only
    var BANDS = ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2']
    var NDFI = calcNDFI(image.select(BANDS))
    return image.addBands([NDVI, NDSI, NBR, EVI, EVI2, TC, NDFI])
  })
}

function calcNDSI(image){
  var ndsi = ee.Image(image).normalizedDifference(['GREEN', 'SWIR1']).rename('NDSI');
   return ndsi
}

/**
* Calculate NDVI for an image
* @param {ee.Image} image  Landsat image with NIR and RED bands
* @returns {ee.Image} NDVI image
*/
function calcNDVI(image) {
   var ndvi = ee.Image(image).normalizedDifference(['NIR', 'RED']).rename('NDVI');
   return ndvi
};

/**
* Calculate NBR for an image
* @param {ee.Image} image  Landsat image with NIR and SWIR2 bands
* @returns {ee.Image} NBR image
*/
function calcNBR(image) {
  var nbr = ee.Image(image).normalizedDifference(['NIR', 'SWIR2']).rename('NBR');
  return nbr
};

/**
 * Calculate NDFI using endmembers from Souza et al., 2005
 * @param {ee.Image} Surface reflectance image with 6 bands (i.e. not thermal)
 * @returns {ee.Image} NDFI transform
 */
function calcNDFI(image) {
  /* Do spectral unmixing */
  var gv = [.0500, .0900, .0400, .6100, .3000, .1000]
  var shade = [0, 0, 0, 0, 0, 0]
  var npv = [.1400, .1700, .2200, .3000, .5500, .3000]
  var soil = [.2000, .3000, .3400, .5800, .6000, .5800]
  var cloud = [.9000, .9600, .8000, .7800, .7200, .6500]
  var cf = .1 // Not parameterized
  var cfThreshold = ee.Image.constant(cf)
  var unmixImage = ee.Image(image).unmix([gv, shade, npv, soil, cloud], true,true)
                  .rename(['band_0', 'band_1', 'band_2','band_3','band_4'])
  var newImage = ee.Image(image).addBands(unmixImage)
  var mask = newImage.select('band_4').lt(cfThreshold)
  var ndfi = ee.Image(unmixImage).expression(
    '((GV / (1 - SHADE)) - (NPV + SOIL)) / ((GV / (1 - SHADE)) + NPV + SOIL)', {
      'GV': ee.Image(unmixImage).select('band_0'),
      'SHADE': ee.Image(unmixImage).select('band_1'),
      'NPV': ee.Image(unmixImage).select('band_2'),
      'SOIL': ee.Image(unmixImage).select('band_3')
    })
    
  return ee.Image(newImage)
        .addBands(ee.Image(ndfi).rename(['NDFI']))
        .select(['band_0','band_1','band_2','band_3','NDFI'])
        .rename(['GV','Shade','NPV','Soil','NDFI'])
        .updateMask(mask)
  }


/**
* Calculate EVI for an image
* @param {ee.Image} image Landsat image with NIR, RED, and BLUE bands
* @returns {ee.Image} EVI transform
*/
function calcEVI(image) {
        
  var evi = ee.Image(image).expression(
          'float(2.5*(((B4) - (B3)) / ((B4) + (6 * (B3)) - (7.5 * (B1)) + 1)))',
          {
              'B4': ee.Image(image).select(['NIR']),
              'B3': ee.Image(image).select(['RED']),
              'B1': ee.Image(image).select(['BLUE'])
          }).rename('EVI');    
  
  return evi
};

/**
* Calculate EVI2 for an image
* @param {ee.Image} image  Landsat image with NIR and RED
* @returns {ee.Image} EVI2 transform
*/
function calcEVI2(image) {
  var evi2 = ee.Image(image).expression(
        'float(2.5*(((B4) - (B3)) / ((B4) + (2.4 * (B3)) + 1)))',
        {
            'B4': image.select('NIR'),
            'B3': image.select('RED')
        });
  return evi2.rename('EVI2')
};

/**
* Tassel Cap coefficients from Crist 1985
* @param {ee.Image} image Landsat image with BLUE, GREEN, RED, NIR, SWIR1, and SWIR2
* @returns {ee.Image} 3-band image with Brightness, Greenness, and Wetness
*/
function tcTrans(image) {

    // Calculate tasseled cap transformation
    var brightness = image.expression(
        '(L1 * B1) + (L2 * B2) + (L3 * B3) + (L4 * B4) + (L5 * B5) + (L6 * B6)',
        {
            'L1': image.select('BLUE'),
            'B1': 0.2043,
            'L2': image.select('GREEN'),
            'B2': 0.4158,
            'L3': image.select('RED'),
            'B3': 0.5524,
            'L4': image.select('NIR'),
            'B4': 0.5741,
            'L5': image.select('SWIR1'),
            'B5': 0.3124,
            'L6': image.select('SWIR2'),
            'B6': 0.2303
        });
    var greenness = image.expression(
        '(L1 * B1) + (L2 * B2) + (L3 * B3) + (L4 * B4) + (L5 * B5) + (L6 * B6)',
        {
            'L1': image.select('BLUE'),
            'B1': -0.1603,
            'L2': image.select('GREEN'),
            'B2': -0.2819,
            'L3': image.select('RED'),
            'B3': -0.4934,
            'L4': image.select('NIR'),
            'B4': 0.7940,
            'L5': image.select('SWIR1'),
            'B5': -0.0002,
            'L6': image.select('SWIR2'),
            'B6': -0.1446
        });
    var wetness = image.expression(
        '(L1 * B1) + (L2 * B2) + (L3 * B3) + (L4 * B4) + (L5 * B5) + (L6 * B6)',
        {
            'L1': image.select('BLUE'),
            'B1': 0.0315,
            'L2': image.select('GREEN'),
            'B2': 0.2021,
            'L3': image.select('RED'),
            'B3': 0.3102,
            'L4': image.select('NIR'),
            'B4': 0.1594,
            'L5': image.select('SWIR1'),
            'B5': -0.6806,
            'L6': image.select('SWIR2'),
            'B6': -0.6109
        });

    var bright =  ee.Image(brightness).rename('BRIGHTNESS');
    var green = ee.Image(greenness).rename('GREENNESS');
    var wet = ee.Image(wetness).rename('WETNESS');
    
    var tasseledCap = ee.Image([bright, green, wet])
    return tasseledCap
}

/**
* Prepare Collection 2 Landsat 4, 5, and 7 with strict filtering of noisy pixels
* @param {ee.Image} image Landsat SR image with pixel_qa band
* @returns {ee.Image} Landsat image with masked noisy pixels
*/
function prepareL4L5L7Col2(image){
  
  var bandList = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7','ST_B6']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var subBand = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']

  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBand = image.select('ST_B6').multiply(0.00341802).add(149.0);
  var scaled = opticalBands.addBands(thermalBand, null, true).select(bandList)
      .rename(nameList);
  
  var validQA = [5440, 5504]  //5442，5506
  
  var mask1 = ee.Image(image).select(['QA_PIXEL']).remap(
      validQA, ee.List.repeat(1, validQA.length), 0)
  // Gat valid data mask, for pixels without band saturation
  var mask2 = image.select('QA_RADSAT').eq(0)
  var mask3 = scaled.select(subBand).reduce(ee.Reducer.min()).gt(0)
  var mask4 = scaled.select(subBand).reduce(ee.Reducer.max()).lt(1)
  // Mask hazy pixels using AOD threshold
  var mask5 = (image.select("SR_ATMOS_OPACITY").unmask(-1)).lt(300) 
  return ee.Image(image).addBands(scaled)
      .updateMask(mask1.and(mask2).and(mask3).and(mask4).and(mask5))
}

/**
* Prepare Collection 2 Landsat 8 with strict filtering of noisy pixels
* @param {ee.Image} image Landsat SR image with pixel_qa band
* @param {Boolean} switch between with/without mask
* @returns {ee.Image} Landsat image with masked noisy pixels
*/
function prepareL8Col2(image){
  
  var bandList = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var subBand = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']
  
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBand = image.select('ST_B10').multiply(0.00341802).add(149.0);
  var scaled = opticalBands.addBands(thermalBand, null, true).select(bandList)
      .rename(nameList);
  
  var validTOA = [2, 4, 32, 66, 68, 96, 100, 130, 132, 160, 164]
  var validQA = [21824, 21888] // 21826, 21890
  
  var mask1 = ee.Image(image).select(['QA_PIXEL']).remap(
      validQA, ee.List.repeat(1, validQA.length), 0)
  var mask2 = image.select('QA_RADSAT').eq(0)
  // Assume that all saturated pixels equal to 20000
  var mask3 = scaled.select(subBand).reduce(ee.Reducer.min()).gt(0)
  var mask4 = scaled.select(subBand).reduce(ee.Reducer.max()).lt(1)
  var mask5 = ee.Image(image).select(['SR_QA_AEROSOL']).remap(
      validTOA, ee.List.repeat(1, validTOA.length), 0)
  
  return ee.Image(image).addBands(scaled)
      .updateMask(mask1.and(mask2).and(mask3).and(mask4).and(mask5))
}

/**
* Generate and combine filtered collections of Landsat 4, 5, 7 and 8
* @param {ee.Image} geom Geometry used to filter the collection
* @param {String} startDate Initial date to filter the collection
* @param {String} endDate Final date to filter the collection
* @returns {ee.ImageCollection} Filtered Landsat collection
*/
function generateCollection(geom, startDate, endDate, collection){
  collection = collection || 1
  
  if (collection == 1){
    print("Collection 1 has been deprecated")
  } else if (collection == 2){
    var filteredL8 = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filter("WRS_ROW < 122")
        .filterBounds(geom)
        .map(prepareL8Col2))
  
    var filteredL7 = (ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
        .filter("WRS_ROW < 122")
        .filterBounds(geom)
        .map(prepareL4L5L7Col2))
                        
    // Originally not included in Noel's run
    var filteredL4 = (ee.ImageCollection('LANDSAT/LT04/C02/T1_L2')
        .filter("WRS_ROW < 122")
        .filterBounds(geom)
              .map(prepareL4L5L7Col2))
    var filteredL5 = (ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
        .filter("WRS_ROW < 122")
        .filterBounds(geom)
                    .map(prepareL4L5L7Col2))
  }
  
  var mergedCollections = ee.ImageCollection(filteredL8).merge(filteredL7)
      .merge(filteredL5).merge(filteredL4).filterDate(startDate, endDate)
  return mergedCollections
}



exports = {
  getLandsat: getLandsat,
  generateCollection: generateCollection,
  doIndices: doIndices,
  calcNDVI: calcNDVI,
  calcNDSI: calcNDSI,
  calcNBR: calcNBR,
  calcEVI: calcEVI,
  calcEVI2: calcEVI2,
  tcTrans: tcTrans,
  calcNDFI: calcNDFI,
  
}



