// Auxiliary model metadata and training methods.
export default {
  "E": {
    "name": "AquaTide",
    "version": "1.0.0",
    "featureVersion": "aqua-ef-0.1",
    "modelSHA256": "e25011f8cf73cda4269cb61cca91914b35a6b13c335e5729700cf694ec061438",
    "browserModelSHA256": "30a1ce7d4b140a2ea79c90b32a36860738dba4af1b997fd4fab76febd83f4bc4",
    "featureSHA256": "10378148819a493511b0c88efcad9f5f21fd32cb72a2a4c8fa011599d58a9751",
    "browserFeatureSHA256": "3f17e8130389a6c6e6cda83527a7b61d15af77402fe49ec09e2c9562397eeb26",
    "browserBaseFeatureSHA256": "2f9f8ce16d1a0238374864a27a0f2f3db0edb149a8059daadacd08cead620f51",
    "browserV2FeatureSHA256": "9e26972fa3cf821f7f00d9ddc9e387b98fad1256dbdf5d8f5b8b74d77a1516bb",
    "acceptedForReview": false,
    "selected": {
      "kind": "positive",
      "feature_set": "all",
      "ridge": 1
    },
    "validation": "same frozen grouped outer 5 / inner 3 development CV; no new blind test"
  },
  "F": {
    "name": "AquaReef",
    "version": "1.0.0",
    "featureVersion": "aqua-ef-0.1",
    "modelSHA256": "0cbb73cf3478652fe5beb62a72cf592419a0be7c1b3510cf39b462473cea1f29",
    "browserModelSHA256": "abdaec38d230f7e1a74bdec3914b920bd2af1f490cc6c62e5e4971bd523e976f",
    "featureSHA256": "10378148819a493511b0c88efcad9f5f21fd32cb72a2a4c8fa011599d58a9751",
    "browserFeatureSHA256": "3f17e8130389a6c6e6cda83527a7b61d15af77402fe49ec09e2c9562397eeb26",
    "browserBaseFeatureSHA256": "2f9f8ce16d1a0238374864a27a0f2f3db0edb149a8059daadacd08cead620f51",
    "browserV2FeatureSHA256": "9e26972fa3cf821f7f00d9ddc9e387b98fad1256dbdf5d8f5b8b74d77a1516bb",
    "acceptedForReview": true,
    "selected": {
      "kind": "tree",
      "feature_set": "all",
      "depth": 1,
      "iterations": 180,
      "balance": true
    },
    "validation": "same frozen grouped outer 5 / inner 3 development CV; no new blind test"
  }
};
