<template>
  <div>
    <p>Component render start</p>
    <HelloWorld msg="Hello Vue in Fenice!" />
    <p>Component render end</p>
  </div>
</template>

<script>
import HelloWorld from "./components/HelloWorld";

export default {
  name: "App",
  components: {
    HelloWorld,
  },
  created() {
    console.log("HomePage created");
  },

  mounted() {
    console.log("HomePage mounted");
  },
};
</script>

<style scoped>
.hello {
  color: red;
}
</style>