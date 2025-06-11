/* * * * 
    Auxiliary Information Extraction for single year 
* * * */

// * * data preprocessing * * //
exports.auxiliary_extrct = function (checkboxDict,samples,target_year){
  
  var StudyRegion = ee.Geometry.Polygon([[-179.99,-89.99],[179.99,-89.99],[179.99,89.99],[-179.99,89.99]])
  target_year = ee.Number.parse(target_year)
  var L89_bands = ['SR_B2', 'SR_B3', 'SR_B4','SR_B5','SR_B6','SR_B7', 'QA_PIXEL'];
  var L8_bands = ['B2','B3','B4','B5','B6','B7','pixel_qa'];
  var L57_bands = ['SR_B1', 'SR_B2', 'SR_B3','SR_B4','SR_B5','SR_B7', 'QA_PIXEL'];
  var new_bands = ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','pixel_qa']
  var LTCol = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').select(L89_bands)
                   .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').select(L89_bands))
                   .merge(ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').select(L57_bands,L89_bands))
                   .merge(ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').select(L57_bands,L89_bands))
                   .filter(ee.Filter.calendarRange(target_year, target_year, 'year')).map(applyScaleFactors)
                   .select(L89_bands,L8_bands).map(Landsat_CloudShadowMask)
                   .filterMetadata('CLOUD_COVER','less_than',50)
                   .select(L8_bands,new_bands)
  var LT_VIs = LTCol.map(Landsat_VIs).reduce(ee.Reducer.percentile([100])).select([
    'BLUE_p100','GREEN_p100','RED_p100','NIR_p100','SWIR1_p100','SWIR2_p100','NDVI_p100','NDWI_p100','NDBI_p100'],
    ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','NDVI','NDWI','NDBI']).set('year',target_year)
  
  // * * VIs * * //
  var VIs = LT_VIs.select(['NDVI','NDWI','NDBI'])
  // * * FVC * * //
  var NDVI = LT_VIs.select('NDVI')
  var FVC = ee.Image(calFVC(NDVI,StudyRegion,30))
  // * * DEM * * //
  var dem_dataset = ee.ImageCollection('JAXA/ALOS/AW3D30/V3_2');
  var elevation = dem_dataset.select('DSM').mosaic().rename('elevation');
  var proj = dem_dataset.first().select(0).projection();
  var slope = ee.Terrain.slope(elevation.setDefaultProjection(proj)).rename('slope')
  // * * Tree height * * //
  var Height_dataset2005 = ee.Image('NASA/JPL/global_forest_canopy_height_2005'); // Global Forest Canopy Height, 2005 
  var forestCanopyHeight2005 = Height_dataset2005.select('1').rename('Height2005');
  
  var forestCanopyHeight2019 = ee.ImageCollection('users/potapovpeter/GEDI_V27')
            .merge(ee.ImageCollection('users/potapovpeter/GEDI_V27')).mosaic().rename('Height2019')// Global Forest Canopy Height, 2019
  
  if (checkboxDict['NDVI'].getValue()){
    samples = addinitialsams(samples,VIs.select('NDVI'),'NDVI')
  }
  if (checkboxDict['NDWI'].getValue()){
    samples = addinitialsams(samples,VIs.select('NDWI'),'NDWI')
  }
  if (checkboxDict['NDBI'].getValue()){
    samples = addinitialsams(samples,VIs.select('NDBI'),'NDBI')
  }
  if (checkboxDict['FVC'].getValue()){
    samples = addinitialsams(samples,FVC,'FVC')
  }
  if (checkboxDict['Elevation'].getValue()){
    samples = addinitialsams(samples,elevation,'elevation')
  }
  if (checkboxDict['Slope'].getValue()){
    samples = addinitialsams(samples,slope,'slope')
  }
  if (checkboxDict['Height2005'].getValue()){
    samples = addinitialsams(samples,forestCanopyHeight2005,'Height2005')
  }
  if (checkboxDict['Height2019'].getValue()){
    samples = addinitialsams(samples,forestCanopyHeight2019,'Height2019')
  }
  
  var samscol_final = ee.FeatureCollection(samples)
  return samscol_final
}

//* * * * * * * * * * FUNCTION CONSTRUCTION  * * * * * * * * * //
function applyScaleFactors(image) {// Applies scaling factors LC5-9.
  var opticalBands = (image.select('SR_B.').multiply(0.0000275).add(-0.2)).multiply(10000)
  return image.addBands(opticalBands, null, true)
}

var Landsat_CloudShadowMask = function(image)
{
  var cloudShadowBitMask = 1 << 3;
  var cloudProbBitMask = 1<<7;
  var snowBitMask = 1<<4;
  var cloudsBitMask = 1 << 5;
  var qa = image.select('pixel_qa');
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0).and(qa.bitwiseAnd(cloudsBitMask).eq(0))
              .and(qa.bitwiseAnd(cloudProbBitMask).eq(0)).and(qa.bitwiseAnd(snowBitMask).eq(0))
  var mask2 = image.reduce(ee.Reducer.min()).gt(0).and(image.reduce(ee.Reducer.max()).lt(10000));
  var mask3 = image.select('B2').subtract(image.select('B4').multiply(0.5)).lte(1200);
  return image.updateMask(mask).updateMask(mask2).updateMask(mask3);//
}

var Landsat_VIs = function(image)    // * * Clalculate VIs * * //
{
  var NDVI = image.normalizedDifference(['NIR', 'RED']).rename('NDVI');
  var NDWI = image.normalizedDifference(['GREEN', 'NIR']).rename('NDWI');
  var NDBI = image.normalizedDifference(['NIR', 'SWIR1']).rename('NDBI')
  image = image.addBands(NDVI).addBands(NDWI).addBands(NDBI)
  return image;
}

// * * Combine two FeatureCollections by joining attributes
function matchingFeatureCol(ini_col,match_col,prop_name){
  var id_list = match_col.reduceColumns({
    reducer: ee.Reducer.toList(),
    selectors: ['id']
  }).get('list');
  id_list = ee.List(id_list)
  var propValue_list = match_col.reduceColumns({
    reducer: ee.Reducer.toList(),
    selectors: [prop_name]
  }).get('list');
  propValue_list = ee.List(propValue_list)
  var match_dictNew = ee.Dictionary.fromLists(ee.List(id_list), ee.List(propValue_list));
  var final_col = ini_col.map(function(feature1) {
    feature1 = ee.Feature(feature1)
    var feature1_id = feature1.id();
    var prop_value = ee.Number.parse(propValue_list.get(id_list.indexOf(feature1_id)));
    var add_feature1 = ee.Algorithms.If(
      ee.Algorithms.IsEqual(prop_value, null),
      feature1.set(prop_name, 9999),  // If no match is found, set cluster to 9999
      feature1.set(prop_name, prop_value)  // If a match is found, set the cluster
    );
    
    return add_feature1;
  });
  return final_col
}
// * * Change ID of FeatureCollection
function Change_ID(featureCol){
  var new_featureCol = featureCol.map(function(feature) {
    feature = ee.Feature(feature)
    var featureid = ee.String(feature.id()).split('_').get(0)
    return feature.set('id', featureid);
  });
  return new_featureCol
}

function addinitialsams(samples,image,prop_name){
  var sample_info = image.sampleRegions({
    collection: samples,
    projection: 'EPSG:4326',
    tileScale: 12,
    geometries: true,
    scale: 30
  })
  var sample_infoNew = Change_ID(sample_info)
  // Combine two FeatureCollections by joining attributes
  var new_samples = matchingFeatureCol(samples,sample_infoNew,prop_name)
  return new_samples
}

function calFVC(NDVI,region,scale){
  var num = NDVI.reduceRegion({
    reducer:ee.Reducer.percentile([0,100]),
    geometry:region,
    scale:scale,
    maxPixels:1e13
  });
  var min = ee.Number(num.get("NDVI_p0"));
  var max = ee.Number(num.get("NDVI_p100"));
  var isMinNull = ee.Algorithms.IsEqual(min, null); 
  var FVC = ee.Algorithms.If(isMinNull, ee.Image(0), fvc_formula(NDVI,region,scale));  
  return ee.Image(FVC).rename('FVC')
}

function fvc_formula(NDVI,region,scale){
  var num = NDVI.reduceRegion({
    reducer:ee.Reducer.percentile([0,100]),
    geometry:region,
    scale:scale,
    maxPixels:1e13
  });
  var min = ee.Number(num.get("NDVI_p0"));
  var max = ee.Number(num.get("NDVI_p100"));
  var min_Image = ee.Image(min)
  var max_Image = ee.Image(max)
  var FVC = (NDVI.subtract(min_Image)).divide(max_Image.subtract(min_Image))
  var FVC_Normalization = FVC.min(ee.Image(1)).max(ee.Image(0))
  return FVC_Normalization
}
