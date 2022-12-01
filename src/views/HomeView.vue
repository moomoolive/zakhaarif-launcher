<template>
  <main>
    <div class="w-screen h-screen flex items-center justify-center">
      <div>
        <div>

        </div>
        <div>
          <v-btn 
            class="bg-green-600"
            :disabled="!isLoading"
            @click="updateFiles"
          >
            {{buttonMessage}}
          </v-btn>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import {VBtn} from "vuetify/components/VBtn"
import {onBeforeMount, ref} from "vue"
import {updateStdFiles} from "../lib/routines/updateCore"
import {sleep} from "../lib/routines/sleep"

let isLoading = ref(true)
let buttonMessage = ref("Start")

const test = () => console.log("hi")

const updateFiles = async () => {
  buttonMessage = "loading..."
  const res = await updateStdFiles({
    manifestUrl: "pkg/manifest.json"
  })
  console.log(res)
  buttonMessage = "finished"
}
</script>
