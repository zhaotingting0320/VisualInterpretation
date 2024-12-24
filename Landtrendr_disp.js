
//########################################################################################################
//##### ANNUAL SR TIME SERIES COLLECTION BUILDING FUNCTIONS ##### 
//########################################################################################################
//------ BUILD A COLLECTION FOR A GIVEN SENSOR AND YEAR -----
var buildSensorYearCollection = function(year, sensor, aoi){
  var srCollection = ee.ImageCollection('LANDSAT/'+ sensor + '/C02/T1_L2')
           .filterBounds(aoi)
           .filterDate(year+'-'+'01-01', year+'-'+'12-31');
  return srCollection;
};
exports.buildSensorYearCollection = buildSensorYearCollection

//define a function to apply Collection 2 scaling coefficients 
var scaleLTdata = function(img){ 
  return ((img.multiply(0.0000275)).add(-0.2)).multiply(10000).toUint16();
}; 
var getSRcollection = function(year, sensor, aoi) {
  // get a landsat collection for given year, day range, and sensor
  var srCollection = buildSensorYearCollection(year, sensor, aoi);
  // apply the harmonization function to LC08 (if LC08), subset bands, unmask, and resample           
  srCollection = srCollection.map(function(img) {
    var dat = ee.Image(
      ee.Algorithms.If(
        (sensor == 'LC08') || (sensor == 'LC09'),                            // condition - if image is OLI
        scaleLTdata(img.select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'],['B1', 'B2', 'B3', 'B4', 'B5', 'B7'])).unmask(),
        scaleLTdata(img.select(['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'],['B1', 'B2', 'B3', 'B4', 'B5', 'B7'])) // false - else select out the reflectance bands from the non-OLI image
          .unmask() .set('system:time_start', img.get('system:time_start')) // ...set the output system:time_start metadata to the input image time_start otherwise it is null
      )
    );
    // makes mask
    var mask = ee.Image(1);
    var qa = img.select('QA_PIXEL'); 
    var mask1 = qa.bitwiseAnd(1<<7).eq(0).multiply(mask)
    var mask2 = qa.bitwiseAnd(1<<4).eq(0).multiply(mask)
    var mask3 = qa.bitwiseAnd(1<<5).eq(0).multiply(mask)
    var mask4 = qa.bitwiseAnd(1<<3).eq(0).multiply(mask) 
    return dat.mask(mask1).mask(mask2).mask(mask3).mask(mask4); 
  });
  return srCollection; // return the prepared collection
};
exports.getSRcollection = getSRcollection;

//------ FUNCTION TO COMBINE LT05, LE07, LC08 and LC09 COLLECTIONS -----
var getCombinedSRcollection = function(year, aoi) {
  var lt5 = getSRcollection(year, 'LT05', aoi);       // get TM collection for a given year, date range, and area
  var le7 = getSRcollection(year, 'LE07', aoi);       // get ETM+ collection for a given year, date range, and area
  var lc8 = getSRcollection(year, 'LC08', aoi);       // get OLI collection for a given year, date range, and area
  var lc9 = getSRcollection(year, 'LC09', aoi);       // get OLI collection for a given year, date range, and area
  var mergedCollection = ee.ImageCollection(lt5.merge(le7).merge(lc8).merge(lc9))
  return mergedCollection;                                              // return the Imagecollection
};
exports.getCombinedSRcollection = getCombinedSRcollection; 


//------ FUNCTION TO REDUCE COLLECTION TO SINGLE IMAGE PER YEAR BY MEDOID -----
// make a medoid composite with equal weight among indices
var medoidMosaic = function(inCollection,dummyCollection) {
  // fill in missing years with the dummy collection
  var imageCount = inCollection.toList(1).length()
  var finalCollection = ee.ImageCollection(ee.Algorithms.If(imageCount.gt(0), inCollection, dummyCollection))
  // calculate median across images in collection per band
  var median = finalCollection.median()
  // calculate the different between the median and the observation per image per band
  var difFromMedian = finalCollection.map(function(img) {
    var diff = ee.Image(img).subtract(median).pow(ee.Image.constant(2))
    return diff.reduce('sum').addBands(img)
  });
  // get the medoid by selecting the image pixel with the smallest difference between median and observation per band 
  return ee.ImageCollection(difFromMedian).reduce(ee.Reducer.min(7)).select([1,2,3,4,5,6], ['B1','B2','B3','B4','B5','B7'])
}


//------ FUNCTION TO APPLY MEDOID COMPOSITING FUNCTION TO A COLLECTION -------------------------------------------
var buildMosaic = function(year, aoi, dummyCollection) {                                                     
  var collection = getCombinedSRcollection(year, aoi)
  var img = medoidMosaic(collection, dummyCollection)                  
              .set('system:time_start', (new Date(year,8,1)).valueOf())
  return ee.Image(img).toUint16()                                            
};
exports.buildMosaic = buildMosaic;

//------ FUNCTION TO BUILD ANNUAL MOSAIC COLLECTION ------------------------------
var buildSRcollection = function(startYear, endYear, aoi) {
  var dummyCollection = ee.ImageCollection([ee.Image([0,0,0,0,0,0]).mask(ee.Image(0))]); // make an image collection from an image with 6 bands all set to 0 and then make them masked values
  var imgs = [];                                                                         // create empty array to fill
  for (var i = startYear; i <= endYear; i++) {                                           // for each year from hard defined start to end build medoid composite and then add to empty img array
    var tmp = buildMosaic(i, aoi, dummyCollection);                    // build the medoid mosaic for a given year
    imgs = imgs.concat(tmp.set('composite_year',i).set('system:time_start', (new Date(i,8,1)).valueOf()));       // concatenate the annual image medoid to the collection (img) and set the date of the image - hard coded to the year that is being worked on for Aug 1st
  }
  return ee.ImageCollection(imgs);                                                       // return the array img array as an image collection
};
exports.buildSRcollection = buildSRcollection;


//------ FUNCTION TO RETURN A LIST OF IMAGES THAT GO INTO ANNUAL SR COMPOSITE COLLECTION ------------------------------
function getImgID(img){return ee.String(ee.Image(img).get('system:id'));}
function getImgIndex(img){return ee.String(ee.Image(img).get('system:index'));}
var getCollectionIDlist = function(startYear, endYear, aoi) {
  var first = true;
  for (var i = startYear; i <= endYear; i++){
    var lt5 = buildSensorYearCollection(i, 'LT05', aoi);
    var le7 = buildSensorYearCollection(i, 'LE07', aoi);
    var lc8 = buildSensorYearCollection(i, 'LC08', aoi);
    var lc9 = buildSensorYearCollection(i, 'LC09', aoi)
    var tmp = ee.ImageCollection(lt5.merge(le7).merge(lc8).merge(lc9)); 
    if(first === true){
      var all = tmp;
      first = false;
    } else{
      all = all.merge(tmp);
    }
  }
  return ee.Dictionary({
    'idList':all.toList(all.size().add(1)).map(getImgID),
    'collection':all
  });
};
exports.getCollectionIDlist = getCollectionIDlist;


exports.runLT = function(startYear, endYear, aoi, index, runParams){
  var annualSRcollection = buildSRcollection(startYear, endYear, aoi); // Peter here, I think this collects surface reflectance images 
  runParams.timeSeries = annualSRcollection;
  return ee.Algorithms.TemporalSegmentation.LandTrendr(runParams);
};


// STANDARD DEVIATION STRETCH
var stdDevStretch = function(img, aoi, nStdev){
  print("stdDevStretch")
  var mean = img.reduceRegion({reducer:ee.Reducer.mean(), geometry:aoi, scale:900, bestEffort:true, maxPixels:1e4})
              .toArray()
              .reduce(ee.Reducer.mean(), [0]);

  var stdDev = img.reduceRegion({reducer:ee.Reducer.stdDev(), geometry:aoi, scale:900, bestEffort:true, maxPixels:1e4})
                .toArray()
                .reduce(ee.Reducer.mean(), [0])
                .multiply(nStdev);

  var max = mean.add(stdDev).getInfo()[0];
  var min = mean.subtract(stdDev).getInfo()[0];
  return [min, max];
};
exports.stdDevStretch = stdDevStretch;

// PARSE OBJECT RETURNED FROM 'getPoint' TO ARRAY OF SOURCE AND FITTED
var ltPixelTimeSeries = function(img, pixel) {
  return img.reduceRegion({
   reducer: 'first',
   geometry: pixel,
   scale: 30
  }).getInfo();
};
exports.ltPixelTimeSeries = ltPixelTimeSeries

exports.ltPixelTimeSeriesArray = function(lt, pixel){
  var pixelTS = ltPixelTimeSeries(lt, pixel);
  if(pixelTS.LandTrendr === null){pixelTS.LandTrendr = [[0,0],[0,0],[0,0]]}
  var data = [['Year', 'Original', 'Fitted']]
  var len = pixelTS.LandTrendr[0].length;
  for (var i = 0; i < len; i++) {
    data = data.concat([[pixelTS.LandTrendr[0][i], pixelTS.LandTrendr[1][i]*1, pixelTS.LandTrendr[2][i]*1]]);
  }
  return {ts:data, rmse:pixelTS.rmse};
};
