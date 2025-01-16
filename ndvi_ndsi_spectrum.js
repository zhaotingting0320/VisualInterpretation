var sg_indice = require('users/Eliza_Ting/code:api_construct/ndvi_ndsi_sg.js')
var ndvi_calc = function(img){
    return img.normalizedDifference(["NIR","RED"]).rename('NDVI')
  }
var ndsi_calc = function(img){
  return ee.Image(img).normalizedDifference(['GREEN', 'SWIR1']).rename('NDSI')
}
/**extact max ndvi/NDSI image
 * @img_ldt:Landsat image collection
 * @slidewindow: the time interval
 * return {ee.ImageCollection}:max composite image in every interval 
 * */
function ldtlist_indice(select_ldt,index,slidewindow,point,str_indice){
  index = ee.Number(index)
  var start = ee.Number(index.multiply(slidewindow))
  var end = ee.Number(index.add(1).multiply(slidewindow))
  var select_ini = select_ldt.filter(ee.Filter.calendarRange(
            start,end,'day_of_year'))
  var select_ldt_final = ee.Algorithms.If(str_indice == 'NDVI',
            select_ini.map(ndvi_calc),select_ini.map(ndsi_calc))
  var ldtmax = ee.List(ee.ImageCollection(ee.ImageCollection(select_ldt_final).max())
              .getRegion(point, 30).slice(1).get(0)).get(4)
  var newldtmax = ee.Number(ee.Algorithms.If(ldtmax,ldtmax,0))
  return newldtmax  
}

/**extact max ndvi/NDSI image
 * @img_mod：MODIS image collection
 * @slidewindow: the time interval
 * return {ee.ImageCollection}:max composite image in every interval 
 * */
function modlist_indice(mod_ndvi,mod_ndsi,index,slidewindow,point,str_indice){
  index = ee.Number(index)
  var start = ee.Number(index.multiply(slidewindow))
  var end = ee.Number(index.add(1).multiply(slidewindow))
  var select_mod_final = ee.Algorithms.If(str_indice == 'NDVI',
            mod_ndvi.filter(ee.Filter.calendarRange(
            start,end,'day_of_year')),mod_ndsi.filter(ee.Filter.calendarRange(
            start,end,'day_of_year')))
  var modmax = ee.List(ee.ImageCollection(ee.ImageCollection(select_mod_final).max())
              .getRegion(point, 30).slice(1).get(0)).get(4)
  var newmodmax = ee.Number(ee.Algorithms.If(modmax,modmax,0))
  return newmodmax  
}

/** year_num : target year
* img_ldt
* slidewindow: slide time interval
* point : geometry ,extract value from the point
* step : Year step
* return array
**/
exports. MVC = function (year_num,img_ldt,mod_ndvi,mod_ndsi,slideWindow,point,step,str_indice){
  year_num = ee.Number(parseInt(value, 10))
  var range=ee.Number(365)
  var slidewindow=ee.Number(slideWindow)  
  var end_index = range.divide(slidewindow).int()
  var x_date_value = ee.List.sequence(0,end_index).map(function(j){
    j = ee.Number(j)
    return j.multiply(slidewindow)
  })
  var select_ldt = img_ldt.filter(ee.Filter.calendarRange(
          year_num.subtract(step),year_num.add(step),'year')) 
  var select_mod_ndvi = mod_ndvi.filter(ee.Filter.calendarRange(
          year_num.subtract(step),year_num.add(step),'year')) 
  var select_mod_ndsi = mod_ndsi.filter(ee.Filter.calendarRange(
          year_num.subtract(step),year_num.add(step),'year'))  
  var ini_indice_list = ee.List.sequence(0, end_index)
  
  var start_value = ee.Number(ee.Algorithms.If(ldtlist_indice(select_ldt,0,slidewindow,point,str_indice),
    ldtlist_indice(select_ldt,0,slidewindow,point,str_indice),
    modlist_indice(select_mod_ndvi,select_mod_ndsi,0,slidewindow,point,str_indice)
  ))
  var end_value = ee.Number(ee.Algorithms.If(ldtlist_indice(select_ldt,end_index,slidewindow,point,str_indice),
    ldtlist_indice(select_ldt,end_index,slidewindow,point,str_indice),
    modlist_indice(select_mod_ndvi,select_mod_ndsi,end_index,slidewindow,point,str_indice)
  ))
  var indice_list = ini_indice_list.map(function(index){
    var max
    if (index === 0){
      max = start_value
    }else if (index == end_index){
      max = end_value
    }else{
      var ldt_index_max = ldtlist_indice(select_ldt,index,slidewindow,point,str_indice)
      var ldt_indexlast_max = ldtlist_indice(select_ldt,ee.Number(index).subtract(ee.Number(1)),slidewindow,point,str_indice)
      var ldt_indexnext_max = ldtlist_indice(select_ldt,ee.Number(index).add(ee.Number(1)),slidewindow,point,str_indice)
      var mod_index_max = modlist_indice(select_mod_ndvi,select_mod_ndsi,index,slidewindow,point,str_indice)
      var diff = ee.Number(mod_index_max.subtract(ldt_indexlast_max)).abs()
      var interpolation = (ldt_indexlast_max.add(ldt_indexnext_max)).divide(2)
      max = ee.Number(ee.Algorithms.If(diff > 0.5,ee.Number(ee.Algorithms.If(
        ldt_index_max,ldt_index_max,interpolation)),ee.Number(ee.Algorithms.If(
        ldt_index_max,ldt_index_max,mod_index_max))))
    }  
    return max    
  })
  /*var index = 36
  return list_indice(select_ldt,index,slidewindow,point,str_indice)*/
  return indice_list
}
/*var year_num = 2020
var L8_bands=['B2','B3','B4','B5','B6','B7','pixel_qa'];
var new_bands=['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','pixel_qa']
var img_ldt = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR').select(L8_bands,new_bands)
var mod_ndvi = ee.ImageCollection('MODIS/MOD09GA_006_NDVI')
var mod_ndsi = ee.ImageCollection('MODIS/MOD09GA_006_NDSI')
var slideWindow = 10
var point = ee.Geometry.Point([114.59457826729795, 33.3533404972818])
var step = 2
var str_indice = 'NDVI'
var ndvi = MVC(year_num,img_ldt,mod_ndvi,mod_ndsi,slideWindow,point,step,str_indice)
print(ndvi)*/
