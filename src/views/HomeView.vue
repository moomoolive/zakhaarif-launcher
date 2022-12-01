<template>
  <main>
    <div class="w-screen h-screen flex items-center justify-center bg-red-500">
      <div>
        <v-btn>
          hi there
        </v-btn>
      </div>
    </div>
  </main>
</template>

<script lang="ts">
import {VBtn} from "vuetify/components/VBtn"

export default {
  components: {
    VBtn
  }
}
</script>

<script setup lang="ts">
import {onBeforeMount} from "vue"
import {updateStdFiles} from "../lib/routines/updateCore"

onBeforeMount(async () => {
  const res = await updateStdFiles({
    manifestUrl: "pkg/manifest.json"
  })
  console.log(res)
})
</script>
