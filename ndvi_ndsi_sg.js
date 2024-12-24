//Get the NDVI time series from the clicked point region
exports. ndvi_sg = function(y,point){
  //The following is the realization of Savitzky-Golay soomthing method
  var window_size = 7
  var half_window =(window_size - 1)/2
  var deriv = 0
  
  var order = 2
  var order_range = ee.List.sequence(0,order)
  var k_range = ee.List.sequence(-half_window, half_window)
  //print(order_range)
  var b = ee.Array(k_range.map(function (k) { return order_range
            .map(function(o) { return ee.Number(k).pow(o)})}))
  
  var mPI = ee.Array(b.matrixPseudoInverse())
  
  var impulse_response = (mPI.slice({axis: 0, start: deriv, end: deriv+1})).project([1])
  
  var y_zero = y.get(0)
  var firstvals = y.slice(1, half_window+1).reverse().map(
    function(e) { return ee.Number(e).subtract(y_zero).abs().multiply(-1).add(y_zero) }
  )
  
  var yend = y.get(-1)
  var lastvals = y.slice(-half_window-1,-1).reverse().map(
   function(e) { return ee.Number(e).subtract(yend).abs().add(yend) }
  )
  
  var y_ext = firstvals.cat(y).cat(lastvals)
  
  var runLength = ee.List.sequence(0, y_ext.length().subtract(window_size))
  
  var smooth = runLength.map(function(i) {
    return ee.Array(y_ext.slice(ee.Number(i), ee.Number(i).add(window_size))).multiply(impulse_response).reduce("sum", [0]).get([0])
  })
  return smooth
}
