/* * * * 
    Assigning initial time-series land cover labels to each sample using the K-Means clustering method 
* * * */
var SetTileScale = 2
exports.TSinfos_extrct = function(samples,Collect_LabPropName,Collect_ConfName,ID_name, start_year,end_year,SetTileScale){
  var StudyRegion = ee.Geometry.Polygon([[-179.99,-89.99],[179.99,-89.99],[179.99,89.99],[-179.99,89.99]])
  var years_num = end_year - start_year
  // * * * Start the main content  * * * //
  var sams_size = samples.size()
  var sams_list = samples.toList(sams_size)
  var sub_list = sams_list.slice(0,200)
  samples = ee.FeatureCollection(sams_list)
  print('sample',samples)

  var L89_bands = ['SR_B2', 'SR_B3', 'SR_B4','SR_B5','SR_B6','SR_B7', 'QA_PIXEL'];
  var L8_bands = ['B2','B3','B4','B5','B6','B7','pixel_qa'];
  var L57_bands = ['SR_B1', 'SR_B2', 'SR_B3','SR_B4','SR_B5','SR_B7', 'QA_PIXEL'];
  var new_bands = ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','pixel_qa']
  var LTCol = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').select(L89_bands)
                 .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').select(L89_bands))
                 .merge(ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').select(L57_bands,L89_bands))
                 .merge(ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').select(L57_bands,L89_bands))
                 .filterDate('1984-01-01','2024-12-31').map(applyScaleFactors)
                 .select(L89_bands,L8_bands).map(Landsat_CloudShadowMask)
                 .filterMetadata('CLOUD_COVER','less_than',60)
                 .select(L8_bands,new_bands)

  var LTColVIs = LTCol.map(Landsat_VIs)
  var final_bands = ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','NDVI','NDWI','NDBI']
  var LTColVIs_Annual = ee.List.sequence(start_year,end_year).map(function(iyear){ // calculate annual max VIs
    var imgcol = LTColVIs.filter(ee.Filter.calendarRange(iyear, iyear, 'year'))
    return imgcol.select(final_bands).reduce(ee.Reducer.percentile([5,50,95])).set('year',iyear);
  })

  var props_names = ee.Feature(sams_list.get(0)).propertyNames()
  var single_image0 = ee.Image(LTColVIs_Annual.get(0))
  var sample_info0 = single_image0.sampleRegions({
    collection: samples,
    projection: 'EPSG:4326',
    tileScale: SetTileScale,
    scale: 30
  })
  var feature_names = sample_info0.first().propertyNames()
  feature_names = feature_names.filter(ee.Filter.inList('item', props_names).not());

  /* * * extract props to KMeans clustering * * */
  var samples_list = ee.List.sequence(0,years_num).map(function(i){
    i = ee.Number(i)
    var single_image = ee.Image(LTColVIs_Annual.get(i))
    var sample_info = single_image.sampleRegions({
      collection: samples,
      projection: 'EPSG:4326',
      tileScale: SetTileScale,
      geometries: true,
      scale: 30
    })
    sample_info = sample_info.map(function(feature){
      return ee.Feature(feature).select(feature_names)
    })
    // KMeans clustering 
    var clusterer = ee.Clusterer.wekaKMeans({nClusters:20}).train(sample_info)
    var result = sample_info.cluster(clusterer)
    var cluster_result = result.select(['cluster'])
    
    var cluster_resultNew = Change_ID(cluster_result)
    // Combine two FeatureCollections by joining attributes
    var match_samples = matchingFeatureCol(samples,cluster_resultNew,'cluster')
    // single_year_lab is applied to Time-series labels
    var year_str = ee.String(ee.Number(start_year).add(i).int())
    var new_samples = ee.FeatureCollection(TSlabel(match_samples, year_str,Collect_LabPropName))
    return new_samples
  })
  var fc1 = ee.FeatureCollection(samples_list.get(0))
  var KMeansFC = samples_list.iterate(function(current, previous) {
    return joinCollections(ee.FeatureCollection(previous), ee.FeatureCollection(current),ID_name);
  },fc1);
  
  /* * * Auxiliary data * * */
  // * * FVC * * //
  var NDVICol_Annual_list = ee.List.sequence(start_year,end_year).map(function(iyear){ // calculate annual max VIs
    var imgcol = LTColVIs.filter(ee.Filter.calendarRange(iyear, iyear, 'year'))
    return imgcol.reduce(ee.Reducer.percentile([100])).select(['NDVI_p100'],['NDVI']).set('year',iyear);
  })
  var FVC_Annual_list = ee.List.sequence(0,years_num).map(function(i){
    i = ee.Number(i)
    var year_str = ee.String('FVC').cat(ee.String(ee.Number(start_year).add(i).int()))
    var NDVI_single = ee.Image(NDVICol_Annual_list.get(i))
    var FVC_single = ee.Image(calFVC(NDVI_single,StudyRegion,30))
    FVC_single = FVC_single.rename(year_str)
    return addinitialsams(samples,FVC_single,year_str)
  })
  var FVC_fc1 = ee.FeatureCollection(FVC_Annual_list.get(0))
  var FVC_FC = FVC_Annual_list.iterate(function(current, previous) {
    return joinCollections(ee.FeatureCollection(previous), ee.FeatureCollection(current),ID_name);
  },FVC_fc1);
  
  // * * DEM * * //
  var dem_dataset = ee.Image('USGS/SRTMGL1_003')
  var elevation = dem_dataset.select('elevation').rename('elevation');
  var slope = ee.Terrain.slope(elevation).rename('slope');
  // * * Tree height * * //
  var Height_dataset2005 = ee.Image('NASA/JPL/global_forest_canopy_height_2005'); // Global Forest Canopy Height, 2005 
  var forestCanopyHeight2005 = Height_dataset2005.select('1').rename('Height2005');
  var forestCanopyHeight2019 = ee.ImageCollection('users/potapovpeter/GEDI_V25_Boreal')
            .merge(ee.ImageCollection('users/potapovpeter/GEDI_V27')).mosaic().rename('Height2019')// Global Forest Canopy Height, 2019
  // * * Property extraction * * //
  samples = addinitialsams(samples,elevation,'elevation')
  samples = addinitialsams(samples,slope,'slope')
  samples = addinitialsams(samples,forestCanopyHeight2005,'Height2005')
  samples = addinitialsams(samples,forestCanopyHeight2019,'Height2019')
  var AuxilarySams = ee.FeatureCollection(samples)
  
  // Merge Props
  var mergedFC = joinCollections(ee.FeatureCollection(KMeansFC), ee.FeatureCollection(FVC_FC),ID_name);
  mergedFC = joinCollections(mergedFC, AuxilarySams,ID_name)
  print(mergedFC,'mergedFC')
  
  // * * NewLab and NewConf * * //
  // var new_samples = mergedFC.map(function(feature){
  //   for(var iyear = start_year; iyear <= end_year; iyear++){
  //     var props1 = 'NewLab' + String(iyear)
  //     var props2 = 'Conf' + String(iyear)
  //     var cluster_lab = feature.get('ClusterLab' + String(iyear))
  //     var conf_lab = feature.get(Collect_ConfName)
  //     feature = feature.set(props1, cluster_lab, props2, conf_lab)
  //   }
  //   return feature
  // })
  
  var years = ee.List.sequence(start_year, end_year);
  var new_samples = mergedFC.map(function(feature) {
    var updatedFeature = years.iterate(function(iyear, feat) {
      feat = ee.Feature(feat);
      var props1 = ee.String('NewLab').cat(ee.Number(iyear).format());
      var props2 = ee.String('Conf').cat(ee.Number(iyear).format());
      var cluster_lab = feat.get(ee.String('ClusterLab').cat(ee.Number(iyear).format()));
      var conf_lab = feat.get(Collect_ConfName);
      return feat.set(props1, cluster_lab).set(props2, conf_lab);
    }, feature);
  
    return ee.Feature(updatedFeature);
  });
  
  return new_samples
  print('ALL',new_samples)
}


//* * * * * * * * * * FUNCTION CONSTRUCTION  * * * * * * * * * //
// * * data preprocessing * * //
function applyScaleFactors(image) {// Applies scaling factors LC5-9.
  var opticalBands = (image.select('SR_B.').multiply(0.0000275).add(-0.2)).multiply(10000)
  return image.addBands(opticalBands, null, true)
}

var Landsat_CloudShadowMask = function(image){
  var cloudShadowBitMask = 1 << 3;
  var cloudProbBitMask = 1<<7;
  var snowBitMask = 1<<4;
  var cloudsBitMask = 1 << 5;
  var qa = image.select('pixel_qa');
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0).and(qa.bitwiseAnd(cloudsBitMask).eq(0))
              .and(qa.bitwiseAnd(cloudProbBitMask).eq(0)).and(qa.bitwiseAnd(snowBitMask).eq(0))
  var mask2=image.reduce(ee.Reducer.min()).gt(0).and(image.reduce(ee.Reducer.max()).lt(10000));
  var mask3=image.select('B2').subtract(image.select('B4').multiply(0.5)).lte(1200);
  return image.updateMask(mask).updateMask(mask2).updateMask(mask3);//
}

// * * Clalculate VIs and percentile * * //
var Landsat_VIs = function(image)
{
  var NDVI = image.normalizedDifference(['NIR', 'RED']).rename('NDVI');
  var NDWI = image.normalizedDifference(['GREEN', 'NIR']).rename('NDWI');
  var NDBI = image.normalizedDifference(['NIR', 'SWIR1']).rename('NDBI')
  image = image.addBands(NDVI).addBands(NDWI).addBands(NDBI)
  return image;
}

// * * join featurecollections * * //
function joinCollections(fcA, fcB,ID_name) {
  var join = ee.Join.inner();
  var filter = ee.Filter.equals({
      leftField: ID_name,
      rightField: ID_name
  });

  var joined = join.apply(fcA, fcB, filter);

  return joined.map(function(f) {
      var left = ee.Feature(f.get('primary'));
      var right = ee.Feature(f.get('secondary'));
      return left.copyProperties(right);
  });
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
  var match_dictNew = ee.Dictionary.fromLists(ee.List(id_list), propValue_list);
  var final_col = ini_col.map(function(feature1) {
    feature1 = ee.Feature(feature1)
    var feature1_id = feature1.id();
    var prop_value = ee.Number.parse(propValue_list.get(id_list.indexOf(feature1_id)));
    var add_feature1 = feature1.set(prop_name, prop_value || 9999)
    return add_feature1;
  });
  return final_col
}

// * * single_year_lab is applied to Time-series labels
function TSlabel(cluster_result, year_str,Collect_LabPropName){
  var cluster_dict = cluster_result.aggregate_array('cluster') .distinct()
  var updatedFeatures = cluster_dict.map(function(clusterId) {
    clusterId = ee.Number(clusterId);
    var clusterFeatures = cluster_result.filter(ee.Filter.eq('cluster', clusterId));
    var labels = clusterFeatures.aggregate_array(Collect_LabPropName);
    var mode_dict = ee.Dictionary(ee.List(labels).reduce(ee.Reducer.frequencyHistogram()))
    var values = mode_dict.values();
    var maxValue = values.reduce(ee.Reducer.max());
    var sizes = values.size()
    var isValue = ee.Algorithms.IsEqual(sizes,9999)
    var modeLabel = mode_dict.keys().get(mode_dict.values().indexOf(maxValue)) || '0'
    var MclusterFeatures = clusterFeatures.map(function(feature) { // Add new mode labels for these Features
      return feature.set(ee.String('ClusterLab').cat(year_str), ee.Number.parse(modeLabel));
    });
    return MclusterFeatures.toList(MclusterFeatures.size())
  }).flatten(); 
  return updatedFeatures
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
    tileScale: SetTileScale,
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

function exporttoAsset(samples,description,assetId){
  Export.table.toAsset({
    collection:samples,
    description:description,
    assetId:assetId
  })
}  

function exporttodrive(samples,description,folder){
  Export.table.toDrive({
    collection:samples,
    description:description,
    folder:folder, 
    fileFormat:'CSV'
  })
}  
